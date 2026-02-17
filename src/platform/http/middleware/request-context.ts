import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { getClaimsFromRequest } from "../../access-control/claims.js";

const REQUEST_ID_HEADER = "x-request-id";

function normalizeRequestId(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const value = raw.trim();
  if (!value || value.length > 128) {
    return null;
  }
  return value;
}

export function createRequestContextMiddleware(input?: { jwtSecret?: string }) {
  const jwtSecret = input?.jwtSecret ?? process.env.JWT_SECRET ?? "dev-v0-jwt-secret";

  return function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
    const incomingHeader = Array.isArray(req.headers[REQUEST_ID_HEADER])
      ? req.headers[REQUEST_ID_HEADER][0]
      : req.headers[REQUEST_ID_HEADER];
    const requestId = normalizeRequestId(incomingHeader) ?? randomUUID();
    const claims = getClaimsFromRequest(req, jwtSecret);

    req.v0Context = {
      requestId,
      startedAtMs: Date.now(),
      actorType: claims ? "ACCOUNT" : undefined,
      actorAccountId: claims?.accountId,
      tenantId: claims?.tenantId ?? null,
      branchId: claims?.branchId ?? null,
    };

    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  };
}

export const requestContextMiddleware = createRequestContextMiddleware();
