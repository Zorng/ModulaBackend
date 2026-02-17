import cors from "cors";
import express from "express";
import { ping, pool } from "#db";
import { log } from "#logger";
import {
  errorHandler,
  notFoundHandler,
} from "./platform/http/middleware/error-handler.js";
import { accessControlHook } from "./platform/http/middleware/access-control-hook.js";
import { v0Router } from "./platform/http/routes/v0.js";
import { startV0CommandOutboxDispatcher } from "./platform/outbox/dispatcher.js";

const app = express();
const shouldRunOutboxDispatcher = process.env.V0_OUTBOX_DISPATCHER_ENABLED !== "false";
const outboxDispatcher = shouldRunOutboxDispatcher
  ? startV0CommandOutboxDispatcher({
      db: pool,
      pollIntervalMs: Number(process.env.V0_OUTBOX_DISPATCHER_INTERVAL_MS ?? 1000),
      batchSize: Number(process.env.V0_OUTBOX_DISPATCHER_BATCH_SIZE ?? 100),
    })
  : null;

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

app.get("/health", async (_req, res) => {
  try {
    const now = await ping();
    res.json({
      status: "ok",
      time: now,
      apiVersion: "v0",
      uptime: process.uptime(),
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.use("/v0", accessControlHook, v0Router);

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  log.info(`server listening on http://localhost:${PORT}`);
  if (shouldRunOutboxDispatcher) {
    log.info("v0 command outbox dispatcher started");
  }
});

function shutdown() {
  outboxDispatcher?.stop();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
