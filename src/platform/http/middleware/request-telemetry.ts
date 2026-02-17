import type { NextFunction, Request, Response } from "express";
import { log } from "#logger";

function nowMs(): number {
  return Date.now();
}

export function requestTelemetryMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startedAtMs = req.v0Context?.startedAtMs ?? nowMs();
  const requestId = req.v0Context?.requestId;
  const route = `${req.baseUrl || ""}${req.path || ""}` || req.path || "/";

  log.info("http.request.started", {
    event: "http.request.started",
    requestId,
    method: req.method,
    route,
  });

  res.on("finish", () => {
    const durationMs = nowMs() - startedAtMs;
    log.info("http.request.completed", {
      event: "http.request.completed",
      requestId: req.v0Context?.requestId,
      actorType: req.v0Context?.actorType,
      actorAccountId: req.v0Context?.actorAccountId,
      tenantId: req.v0Context?.tenantId,
      branchId: req.v0Context?.branchId,
      actionKey: req.v0Context?.actionKey,
      idempotencyKey: req.v0Context?.idempotencyKey,
      method: req.method,
      route,
      statusCode: res.statusCode,
      durationMs,
    });
  });

  next();
}
