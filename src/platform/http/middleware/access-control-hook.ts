import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { pool } from "#db";
import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

type AccessControlScope = "GLOBAL" | "TENANT" | "BRANCH";
type TenantSource = "token" | "body.tenantId" | "path.membershipId";
type BranchSource = "token" | "body.branchId";

type AccessControlRoute = {
  method: string;
  pattern: RegExp;
  scope: AccessControlScope;
  tenantSource?: TenantSource;
  branchSource?: BranchSource;
  requiredRoles?: string[];
};

type V0Claims = {
  accountId: string;
  scope?: string;
  tenantId?: string | null;
  branchId?: string | null;
};

type HookDeps = {
  db?: Queryable;
  jwtSecret?: string;
};

const OPEN_ROUTES: Array<{ method: string; pattern: RegExp }> = [
  { method: "POST", pattern: /^\/auth\/register$/ },
  { method: "POST", pattern: /^\/auth\/otp\/send$/ },
  { method: "POST", pattern: /^\/auth\/otp\/verify$/ },
  { method: "POST", pattern: /^\/auth\/login$/ },
  { method: "POST", pattern: /^\/auth\/refresh$/ },
  { method: "POST", pattern: /^\/auth\/logout$/ },
  { method: "GET", pattern: /^\/health$/ },
];

const PROTECTED_ROUTES: AccessControlRoute[] = [
  {
    method: "GET",
    pattern: /^\/auth\/context\/tenants$/,
    scope: "GLOBAL",
  },
  {
    method: "POST",
    pattern: /^\/auth\/context\/tenant\/select$/,
    scope: "TENANT",
    tenantSource: "body.tenantId",
  },
  {
    method: "GET",
    pattern: /^\/auth\/context\/branches$/,
    scope: "TENANT",
    tenantSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/auth\/context\/branch\/select$/,
    scope: "BRANCH",
    tenantSource: "token",
    branchSource: "body.branchId",
  },
  {
    method: "POST",
    pattern: /^\/auth\/memberships\/invite$/,
    scope: "TENANT",
    tenantSource: "body.tenantId",
    requiredRoles: ["OWNER", "ADMIN"],
  },
  {
    method: "GET",
    pattern: /^\/auth\/memberships\/invitations$/,
    scope: "GLOBAL",
  },
  {
    method: "POST",
    pattern: /^\/auth\/memberships\/invitations\/[^/]+\/accept$/,
    scope: "GLOBAL",
  },
  {
    method: "POST",
    pattern: /^\/auth\/memberships\/invitations\/[^/]+\/reject$/,
    scope: "GLOBAL",
  },
  {
    method: "POST",
    pattern: /^\/auth\/memberships\/[^/]+\/role$/,
    scope: "TENANT",
    tenantSource: "path.membershipId",
    requiredRoles: ["OWNER", "ADMIN"],
  },
  {
    method: "POST",
    pattern: /^\/auth\/memberships\/[^/]+\/revoke$/,
    scope: "TENANT",
    tenantSource: "path.membershipId",
    requiredRoles: ["OWNER", "ADMIN"],
  },
  {
    method: "POST",
    pattern: /^\/auth\/memberships\/[^/]+\/branches$/,
    scope: "TENANT",
    tenantSource: "path.membershipId",
    requiredRoles: ["OWNER", "ADMIN"],
  },
  {
    method: "POST",
    pattern: /^\/auth\/tenants$/,
    scope: "GLOBAL",
  },
  {
    method: "POST",
    pattern: /^\/attendance\/check-in$/,
    scope: "BRANCH",
    tenantSource: "token",
    branchSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/attendance\/check-out$/,
    scope: "BRANCH",
    tenantSource: "token",
    branchSource: "token",
  },
  {
    method: "GET",
    pattern: /^\/attendance\/me$/,
    scope: "BRANCH",
    tenantSource: "token",
    branchSource: "token",
  },
];

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

    const route = PROTECTED_ROUTES.find(
      (candidate) => candidate.method === method && candidate.pattern.test(path)
    );
    if (!route) {
      next();
      return;
    }

    const claims = getClaimsFromRequest(req, jwtSecret);
    if (!claims) {
      deny(res, 401, "INVALID_ACCESS_TOKEN");
      return;
    }

    try {
      const accountId = claims.accountId;
      const tenantId = await resolveTenantId({
        route,
        req,
        claims,
        db,
      });

      if (route.scope !== "GLOBAL") {
        if (!tenantId) {
          deny(res, 403, "TENANT_CONTEXT_REQUIRED");
          return;
        }

        const tenantStatus = await getTenantStatus(db, tenantId);
        if (!tenantStatus) {
          deny(res, 404, "TENANT_NOT_FOUND");
          return;
        }
        if (tenantStatus !== "ACTIVE") {
          deny(res, 403, "TENANT_NOT_ACTIVE");
          return;
        }

        const membership = await getActiveMembership(db, accountId, tenantId);
        if (!membership) {
          deny(res, 403, "NO_MEMBERSHIP");
          return;
        }

        if (
          Array.isArray(route.requiredRoles) &&
          route.requiredRoles.length > 0 &&
          !route.requiredRoles.includes(membership.role_key)
        ) {
          deny(res, 403, "PERMISSION_DENIED");
          return;
        }

        if (route.scope === "BRANCH") {
          const branchId = resolveBranchId(route, req, claims);
          if (!branchId) {
            deny(res, 403, "BRANCH_CONTEXT_REQUIRED");
            return;
          }

          const hasAccess = await hasActiveBranchAccess({
            db,
            accountId,
            tenantId,
            branchId,
          });
          if (!hasAccess) {
            deny(res, 403, "NO_BRANCH_ACCESS");
            return;
          }
        }
      }

      next();
    } catch {
      deny(res, 500, "ACCESS_CONTROL_FAILURE");
    }
  };
}

export const accessControlHook = createAccessControlHook();

function isOpenRoute(method: string, path: string): boolean {
  return OPEN_ROUTES.some(
    (route) => route.method === method && route.pattern.test(path)
  );
}

function getClaimsFromRequest(req: Request, jwtSecret: string): V0Claims | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return null;
  }
  try {
    const decoded = jwt.verify(token, jwtSecret) as V0Claims;
    if (!decoded || decoded.scope !== "v0" || typeof decoded.accountId !== "string") {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

async function resolveTenantId(input: {
  route: AccessControlRoute;
  req: Request;
  claims: V0Claims;
  db: Queryable;
}): Promise<string | null> {
  const source = input.route.tenantSource;
  if (!source) {
    return null;
  }

  if (source === "token") {
    return normalizeId(input.claims.tenantId);
  }

  if (source === "body.tenantId") {
    return normalizeId(input.req.body?.tenantId);
  }

  if (source === "path.membershipId") {
    const membershipId = extractMembershipId(input.req.path);
    if (!membershipId) {
      return null;
    }
    const result = await input.db.query<{ tenant_id: string }>(
      `SELECT tenant_id
       FROM v0_tenant_memberships
       WHERE id = $1`,
      [membershipId]
    );
    return normalizeId(result.rows[0]?.tenant_id ?? null);
  }

  return null;
}

function resolveBranchId(
  route: AccessControlRoute,
  req: Request,
  claims: V0Claims
): string | null {
  const source = route.branchSource;
  if (!source) {
    return null;
  }
  if (source === "token") {
    return normalizeId(claims.branchId);
  }
  if (source === "body.branchId") {
    return normalizeId(req.body?.branchId);
  }
  return null;
}

function extractMembershipId(path: string): string | null {
  const match = path.match(/^\/auth\/memberships\/([^/]+)/);
  if (!match) {
    return null;
  }
  return normalizeId(match[1]);
}

function normalizeId(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

async function getTenantStatus(db: Queryable, tenantId: string): Promise<string | null> {
  const result = await db.query<{ status: string }>(
    `SELECT status
     FROM tenants
     WHERE id = $1`,
    [tenantId]
  );
  return result.rows[0]?.status ?? null;
}

async function getActiveMembership(
  db: Queryable,
  accountId: string,
  tenantId: string
): Promise<{ id: string; role_key: string } | null> {
  const result = await db.query<{ id: string; role_key: string }>(
    `SELECT id, role_key
     FROM v0_tenant_memberships
     WHERE account_id = $1
       AND tenant_id = $2
       AND status = 'ACTIVE'
     LIMIT 1`,
    [accountId, tenantId]
  );
  return result.rows[0] ?? null;
}

async function hasActiveBranchAccess(input: {
  db: Queryable;
  accountId: string;
  tenantId: string;
  branchId: string;
}): Promise<boolean> {
  const result = await input.db.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM v0_branch_assignments ba
       JOIN v0_tenant_memberships m ON m.id = ba.membership_id
       JOIN branches b ON b.id = ba.branch_id
       WHERE ba.account_id = $1
         AND ba.tenant_id = $2
         AND ba.branch_id = $3
         AND ba.status = 'ACTIVE'
         AND m.account_id = $1
         AND m.tenant_id = $2
         AND m.status = 'ACTIVE'
         AND b.tenant_id = $2
         AND b.status = 'ACTIVE'
     ) AS exists`,
    [input.accountId, input.tenantId, input.branchId]
  );
  return result.rows[0]?.exists === true;
}

function deny(res: Response, statusCode: number, code: string): void {
  res.status(statusCode).json({
    success: false,
    error: code,
    code,
  });
}
