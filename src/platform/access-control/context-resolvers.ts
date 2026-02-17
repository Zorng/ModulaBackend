import type { Request } from "express";
import type { ProtectedRoute, Queryable, V0Claims } from "./types.js";

export async function resolveTenantId(input: {
  route: ProtectedRoute;
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

export function resolveBranchId(input: {
  route: ProtectedRoute;
  req: Request;
  claims: V0Claims;
}): string | null {
  const source = input.route.branchSource;
  if (!source) {
    return null;
  }
  if (source === "token") {
    return normalizeId(input.claims.branchId);
  }
  if (source === "body.branchId") {
    return normalizeId(input.req.body?.branchId);
  }
  return null;
}

function extractMembershipId(path: string): string | null {
  const match = path.match(/^\/(auth|org)\/memberships\/([^/]+)/)
    ?? path.match(/^\/hr\/staff\/memberships\/([^/]+)/);
  if (!match) {
    return null;
  }
  return normalizeId(match[2] ?? match[1]);
}

function normalizeId(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}
