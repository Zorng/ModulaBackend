import type { NextFunction, Request, Response } from "express";
import { pool } from "#db";
import { authorizeRoute } from "../../access-control/authorize.js";
import { getClaimsFromRequest } from "../../access-control/claims.js";
import { isOpenRoute } from "../../access-control/open-routes.js";
import { matchProtectedRoute } from "../../access-control/route-registry.js";
import type { Queryable } from "../../access-control/types.js";

type HookDeps = {
  db?: Queryable;
  jwtSecret?: string;
};

export function createAccessControlHook(deps: HookDeps = {}) {
  const db = deps.db ?? pool;
  const jwtSecret = deps.jwtSecret ?? process.env.JWT_SECRET ?? "dev-v0-jwt-secret";

  return async function accessControlHook(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const method = req.method.toUpperCase();
    const path = req.path;

    if (isOpenRoute(method, path)) {
      next();
      return;
    }

    const route = matchProtectedRoute(method, path);
    if (!route) {
      deny(res, 403, "ACCESS_CONTROL_ROUTE_NOT_REGISTERED");
      return;
    }
    if (req.v0Context) {
      req.v0Context.actionKey = route.actionKey;
    }

    const claims = getClaimsFromRequest(req, jwtSecret);
    if (!claims) {
      deny(res, 401, "INVALID_ACCESS_TOKEN");
      return;
    }
    if (req.v0Context) {
      req.v0Context.actorType = "ACCOUNT";
      req.v0Context.actorAccountId = claims.accountId;
      req.v0Context.tenantId = claims.tenantId ?? null;
      req.v0Context.branchId = claims.branchId ?? null;
    }

    try {
      const decision = await authorizeRoute({
        route,
        req,
        claims,
        db,
      });
      if (!decision.allow) {
        deny(res, decision.statusCode, decision.code);
        return;
      }

      next();
    } catch {
      deny(res, 500, "ACCESS_CONTROL_FAILURE");
    }
  };
}

export const accessControlHook = createAccessControlHook();

function deny(res: Response, statusCode: number, code: string): void {
  (res.locals as Record<string, unknown>).errorCode = code;
  res.status(statusCode).json({
    success: false,
    error: code,
    code,
  });
}
