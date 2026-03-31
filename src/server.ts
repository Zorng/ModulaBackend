import cors from "cors";
import express from "express";
import { ping, pool } from "#db";
import { log } from "#logger";
import {
  getKhqrWebhookDiagnostics,
  renderPrometheusMetrics,
} from "./platform/observability/metrics.js";
import {
  errorHandler,
  notFoundHandler,
} from "./platform/http/middleware/error-handler.js";
import { accessControlHook } from "./platform/http/middleware/access-control-hook.js";
import { requestContextMiddleware } from "./platform/http/middleware/request-context.js";
import { requestTelemetryMiddleware } from "./platform/http/middleware/request-telemetry.js";
import { imageProxyRouter } from "./platform/http/routes/image-proxy.js";
import { v0Router } from "./platform/http/routes/v0.js";
import {
  createRuntimeDispatchers,
  logRuntimeDispatchersStarted,
  stopRuntimeDispatchers,
} from "./platform/server/runtime-dispatchers.js";
import {
  resolveKhqrWebhookHealth,
  resolveKhqrReconciliationHealth,
  resolveMediaCleanupHealth,
  resolveOutboxHealth,
} from "./platform/server/health.js";

const app = express();
const dispatchers = createRuntimeDispatchers(pool);
const rawCorsOrigin = String(process.env.CORS_ORIGIN ?? "").trim();
const configuredCorsOrigins = rawCorsOrigin
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const corsOrigin =
  configuredCorsOrigins.length === 0 || configuredCorsOrigins.includes("*")
    ? "*"
    : configuredCorsOrigins.length === 1
      ? configuredCorsOrigins[0]
      : configuredCorsOrigins;

app.use(
  cors({
    origin: corsOrigin,
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
      enabled: dispatchers.outbox.enabled,
      status: dispatchers.outbox.dispatcher?.getStatus() ?? null,
      staleAfterMs: dispatchers.outbox.healthStaleMs,
    });
    const mediaCleanupStatus = resolveMediaCleanupHealth({
      enabled: dispatchers.mediaCleanup.enabled,
      status: dispatchers.mediaCleanup.dispatcher?.getStatus() ?? null,
      staleAfterMs: dispatchers.mediaCleanup.healthStaleMs,
    });
    const khqrReconciliationStatus = resolveKhqrReconciliationHealth({
      enabled: dispatchers.khqrReconciliation.enabled,
      status: dispatchers.khqrReconciliation.dispatcher?.getStatus() ?? null,
      staleAfterMs: dispatchers.khqrReconciliation.healthStaleMs,
    });
    const khqrWebhookStatus = resolveKhqrWebhookHealth({
      diagnostics: getKhqrWebhookDiagnostics(),
    });
    res.json({
      status:
        outboxStatus.status === "degraded"
        || mediaCleanupStatus.status === "degraded"
        || khqrReconciliationStatus.status === "degraded"
          ? "degraded"
          : "ok",
      time: now,
      apiVersion: "v0",
      uptime: process.uptime(),
      components: {
        db: { status: "ok" },
        outbox: outboxStatus,
        mediaCleanup: mediaCleanupStatus,
        khqrReconciliation: khqrReconciliationStatus,
        khqrWebhook: khqrWebhookStatus,
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
  logRuntimeDispatchersStarted(dispatchers);
});

function shutdown() {
  stopRuntimeDispatchers(dispatchers);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
