import type { NextFunction, Request, Response } from "express";
import { log } from "#logger";
import { recordHttpRequest, recordHttpRequestError } from "../../observability/metrics.js";

function nowMs(): number {
  return Date.now();
}

function resolveRouteLabel(req: Request): string {
  const routePath =
    typeof req.route?.path === "string" && req.route.path.trim()
      ? req.route.path
      : req.path;
  return `${req.baseUrl || ""}${routePath || ""}` || "/";
}

export function requestTelemetryMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startedAtMs = req.v0Context?.startedAtMs ?? nowMs();
  const requestId = req.v0Context?.requestId;
  const startedRoute = `${req.baseUrl || ""}${req.path || ""}` || req.path || "/";

  log.info("http.request.started", {
    event: "http.request.started",
    requestId,
    method: req.method,
    route: startedRoute,
  });

  res.on("finish", () => {
    const durationMs = nowMs() - startedAtMs;
    const route = resolveRouteLabel(req);
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

    recordHttpRequest({
      method: req.method,
      route,
      statusCode: res.statusCode,
      durationMs,
    });
    if (res.statusCode >= 400) {
      const errorCode =
        typeof (res.locals as Record<string, unknown>)?.errorCode === "string"
          ? String((res.locals as Record<string, unknown>).errorCode)
          : `HTTP_${res.statusCode}`;
      recordHttpRequestError({
        method: req.method,
        route,
        errorCode,
      });
    }
  });

  next();
}
