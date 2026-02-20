import cors from "cors";
import express from "express";
import { ping, pool } from "#db";
import { log } from "#logger";
import { renderPrometheusMetrics } from "./platform/observability/metrics.js";
import {
  errorHandler,
  notFoundHandler,
} from "./platform/http/middleware/error-handler.js";
import { accessControlHook } from "./platform/http/middleware/access-control-hook.js";
import { requestContextMiddleware } from "./platform/http/middleware/request-context.js";
import { requestTelemetryMiddleware } from "./platform/http/middleware/request-telemetry.js";
import { imageProxyRouter } from "./platform/http/routes/image-proxy.js";
import { v0Router } from "./platform/http/routes/v0.js";
import { startV0CommandOutboxDispatcher } from "./platform/outbox/dispatcher.js";
import { startV0MediaUploadCleanupDispatcher } from "./platform/media-uploads/cleanup-dispatcher.js";
import { startV0KhqrReconciliationDispatcher } from "#modules/v0/platformSystem/khqrPayment/index.js";

const app = express();
const shouldRunOutboxDispatcher = process.env.V0_OUTBOX_DISPATCHER_ENABLED !== "false";
const outboxPollIntervalMs = Number(process.env.V0_OUTBOX_DISPATCHER_INTERVAL_MS ?? 1000);
const outboxBatchSize = Number(process.env.V0_OUTBOX_DISPATCHER_BATCH_SIZE ?? 100);
const outboxDispatcher = shouldRunOutboxDispatcher
  ? startV0CommandOutboxDispatcher({
      db: pool,
      pollIntervalMs: outboxPollIntervalMs,
      batchSize: outboxBatchSize,
    })
  : null;
const isR2Configured =
  Boolean(process.env.R2_ACCOUNT_ID) &&
  Boolean(process.env.R2_ACCESS_KEY_ID) &&
  Boolean(process.env.R2_SECRET_ACCESS_KEY) &&
  Boolean(process.env.R2_BUCKET_NAME);
const shouldRunMediaCleanup =
  process.env.V0_MEDIA_CLEANUP_ENABLED !== "false" && isR2Configured;
const mediaCleanupIntervalMs = Number(process.env.V0_MEDIA_CLEANUP_INTERVAL_MS ?? 60_000);
const mediaCleanupBatchSize = Number(process.env.V0_MEDIA_CLEANUP_BATCH_SIZE ?? 100);
const mediaCleanupPendingAgeMinutes = Number(
  process.env.V0_MEDIA_CLEANUP_PENDING_AGE_MINUTES ?? 24 * 60
);
const mediaCleanupDispatcher = shouldRunMediaCleanup
  ? startV0MediaUploadCleanupDispatcher({
      db: pool,
      pollIntervalMs: mediaCleanupIntervalMs,
      batchSize: mediaCleanupBatchSize,
      pendingAgeMinutes: mediaCleanupPendingAgeMinutes,
    })
  : null;
const shouldRunKhqrReconciliation =
  process.env.V0_KHQR_RECONCILIATION_ENABLED !== "false";
const khqrReconciliationIntervalMs = Number(
  process.env.V0_KHQR_RECONCILIATION_INTERVAL_MS ?? 30_000
);
const khqrReconciliationBatchSize = Number(
  process.env.V0_KHQR_RECONCILIATION_BATCH_SIZE ?? 50
);
const khqrReconciliationRecheckWindowMinutes = Number(
  process.env.V0_KHQR_RECONCILIATION_RECHECK_WINDOW_MINUTES ?? 2
);
const khqrReconciliationDispatcher = shouldRunKhqrReconciliation
  ? startV0KhqrReconciliationDispatcher({
      db: pool,
      pollIntervalMs: khqrReconciliationIntervalMs,
      batchSize: khqrReconciliationBatchSize,
      recheckWindowMinutes: khqrReconciliationRecheckWindowMinutes,
    })
  : null;

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id", "Idempotency-Key"],
    exposedHeaders: ["X-Request-Id"],
  })
);

app.use(express.json());
app.use(requestContextMiddleware);
app.use(requestTelemetryMiddleware);
app.use("/", imageProxyRouter);

app.get("/health", async (_req, res) => {
  try {
    const now = await ping();
    const outboxStatus = resolveOutboxHealth({
      enabled: shouldRunOutboxDispatcher,
      status: outboxDispatcher?.getStatus() ?? null,
      staleAfterMs: Number(process.env.V0_OUTBOX_HEALTH_STALE_MS ?? outboxPollIntervalMs * 5),
    });
    const mediaCleanupStatus = resolveMediaCleanupHealth({
      enabled: shouldRunMediaCleanup,
      status: mediaCleanupDispatcher?.getStatus() ?? null,
      staleAfterMs: Number(
        process.env.V0_MEDIA_CLEANUP_HEALTH_STALE_MS ?? mediaCleanupIntervalMs * 5
      ),
    });
    res.json({
      status:
        outboxStatus.status === "degraded" || mediaCleanupStatus.status === "degraded"
          ? "degraded"
          : "ok",
      time: now,
      apiVersion: "v0",
      uptime: process.uptime(),
      components: {
        db: { status: "ok" },
        outbox: outboxStatus,
        mediaCleanup: mediaCleanupStatus,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
      components: {
        db: { status: "error" },
      },
    });
  }
});

app.get("/metrics", (_req, res) => {
  res
    .status(200)
    .type("text/plain; version=0.0.4; charset=utf-8")
    .send(renderPrometheusMetrics());
});

app.use("/v0", accessControlHook, v0Router);

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  log.info("server.started", {
    event: "server.started",
    port: Number(PORT),
    url: `http://localhost:${PORT}`,
  });
  if (shouldRunOutboxDispatcher) {
    log.info("outbox.dispatcher.started", {
      event: "outbox.dispatcher.started",
      pollIntervalMs: outboxPollIntervalMs,
      batchSize: outboxBatchSize,
    });
  }
  if (shouldRunMediaCleanup) {
    log.info("media.cleanup.started", {
      event: "media.cleanup.started",
      pollIntervalMs: mediaCleanupIntervalMs,
      batchSize: mediaCleanupBatchSize,
      pendingAgeMinutes: mediaCleanupPendingAgeMinutes,
    });
  } else if (process.env.V0_MEDIA_CLEANUP_ENABLED !== "false" && !isR2Configured) {
    log.info("media.cleanup.skipped", {
      event: "media.cleanup.skipped",
      reason: "R2_NOT_CONFIGURED",
    });
  }
  if (shouldRunKhqrReconciliation) {
    log.info("khqr.reconciliation.started", {
      event: "khqr.reconciliation.started",
      pollIntervalMs: khqrReconciliationIntervalMs,
      batchSize: khqrReconciliationBatchSize,
      recheckWindowMinutes: khqrReconciliationRecheckWindowMinutes,
    });
  }
});

function shutdown() {
  outboxDispatcher?.stop();
  mediaCleanupDispatcher?.stop();
  khqrReconciliationDispatcher?.stop();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function resolveOutboxHealth(input: {
  enabled: boolean;
  status: {
    pollIntervalMs: number;
    batchSize: number;
    lastTickAt: string | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastError: string | null;
  } | null;
  staleAfterMs: number;
}): {
  status: "ok" | "degraded" | "disabled";
  pollIntervalMs?: number;
  batchSize?: number;
  lastTickAt?: string | null;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  lastError?: string | null;
} {
  if (!input.enabled) {
    return { status: "disabled" };
  }
  if (!input.status) {
    return { status: "degraded" };
  }

  const nowMs = Date.now();
  const lastTickMs = input.status.lastTickAt ? Date.parse(input.status.lastTickAt) : NaN;
  const isStale = Number.isFinite(lastTickMs) ? nowMs - lastTickMs > input.staleAfterMs : true;
  const latestFailureMs = input.status.lastFailureAt
    ? Date.parse(input.status.lastFailureAt)
    : Number.NEGATIVE_INFINITY;
  const latestSuccessMs = input.status.lastSuccessAt
    ? Date.parse(input.status.lastSuccessAt)
    : Number.NEGATIVE_INFINITY;

  const degraded = isStale || latestFailureMs > latestSuccessMs;

  return {
    status: degraded ? "degraded" : "ok",
    pollIntervalMs: input.status.pollIntervalMs,
    batchSize: input.status.batchSize,
    lastTickAt: input.status.lastTickAt,
    lastSuccessAt: input.status.lastSuccessAt,
    lastFailureAt: input.status.lastFailureAt,
    lastError: input.status.lastError,
  };
}

function resolveMediaCleanupHealth(input: {
  enabled: boolean;
  status: {
    pollIntervalMs: number;
    batchSize: number;
    pendingAgeMinutes: number;
    lastTickAt: string | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastError: string | null;
    lastClaimedCount: number;
    lastDeletedCount: number;
    lastFailedCount: number;
  } | null;
  staleAfterMs: number;
}): {
  status: "ok" | "degraded" | "disabled";
  pollIntervalMs?: number;
  batchSize?: number;
  pendingAgeMinutes?: number;
  lastTickAt?: string | null;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  lastError?: string | null;
  lastClaimedCount?: number;
  lastDeletedCount?: number;
  lastFailedCount?: number;
} {
  if (!input.enabled) {
    return { status: "disabled" };
  }
  if (!input.status) {
    return { status: "degraded" };
  }

  const nowMs = Date.now();
  const lastTickMs = input.status.lastTickAt ? Date.parse(input.status.lastTickAt) : NaN;
  const isStale = Number.isFinite(lastTickMs) ? nowMs - lastTickMs > input.staleAfterMs : true;
  const latestFailureMs = input.status.lastFailureAt
    ? Date.parse(input.status.lastFailureAt)
    : Number.NEGATIVE_INFINITY;
  const latestSuccessMs = input.status.lastSuccessAt
    ? Date.parse(input.status.lastSuccessAt)
    : Number.NEGATIVE_INFINITY;

  const degraded = isStale || latestFailureMs > latestSuccessMs;

  return {
    status: degraded ? "degraded" : "ok",
    pollIntervalMs: input.status.pollIntervalMs,
    batchSize: input.status.batchSize,
    pendingAgeMinutes: input.status.pendingAgeMinutes,
    lastTickAt: input.status.lastTickAt,
    lastSuccessAt: input.status.lastSuccessAt,
    lastFailureAt: input.status.lastFailureAt,
    lastError: input.status.lastError,
    lastClaimedCount: input.status.lastClaimedCount,
    lastDeletedCount: input.status.lastDeletedCount,
    lastFailedCount: input.status.lastFailedCount,
  };
}
