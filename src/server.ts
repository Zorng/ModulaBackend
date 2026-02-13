import cors from "cors";
import express from "express";
import { ping } from "#db";
import { log } from "#logger";
import {
  errorHandler,
  notFoundHandler,
} from "./platform/http/middleware/error-handler.js";
import { accessControlHook } from "./platform/http/middleware/access-control-hook.js";
import { v0Router } from "./platform/http/routes/v0.js";

const app = express();

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
});
