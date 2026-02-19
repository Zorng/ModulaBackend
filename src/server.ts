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
    res.json({
      status: outboxStatus.status === "degraded" ? "degraded" : "ok",
      time: now,
      apiVersion: "v0",
      uptime: process.uptime(),
      components: {
        db: { status: "ok" },
        outbox: outboxStatus,
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
});

function shutdown() {
  outboxDispatcher?.stop();
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
