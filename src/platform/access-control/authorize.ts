import type { Request } from "express";
import { ACTION_METADATA } from "./action-catalog.js";
import { resolveBranchId, resolveTenantId } from "./context-resolvers.js";
import {
  getActiveMembership,
  getBranchStatus,
  getSubscriptionState,
  getTenantStatus,
  hasActiveBranchAccess,
} from "./data-access.js";
import { evaluateEntitlement } from "./entitlements.js";
import type { ProtectedRoute, Queryable, RoleKey, V0Claims } from "./types.js";

export type AuthorizationDecision =
  | { allow: true }
  | { allow: false; statusCode: number; code: string };

export async function authorizeRoute(input: {
  route: ProtectedRoute;
  req: Request;
  claims: V0Claims;
  db: Queryable;
}): Promise<AuthorizationDecision> {
  const action = ACTION_METADATA[input.route.actionKey];
  if (!action) {
    return deny(500, "ACCESS_CONTROL_CONFIG_ERROR");
  }

  if (action.scope === "GLOBAL") {
    return { allow: true };
  }

  if (action.scope === "ACCOUNT") {
    return { allow: true };
  }

  const accountId = input.claims.accountId;
  const tenantId = await resolveTenantId({
    route: input.route,
    req: input.req,
    claims: input.claims,
    db: input.db,
  });

  if (!tenantId) {
    return deny(403, "TENANT_CONTEXT_REQUIRED");
  }

  const subscriptionState = await getSubscriptionState(input.db, tenantId);
  if (
    action.effect === "WRITE" &&
    subscriptionState === "PAST_DUE" &&
    UPGRADE_ONLY_ACTIONS.has(input.route.actionKey)
  ) {
    return deny(403, "SUBSCRIPTION_UPGRADE_REQUIRED");
  }
  if (action.effect === "WRITE" && subscriptionState === "FROZEN") {
    return deny(403, "SUBSCRIPTION_FROZEN");
  }

  const tenantStatus = await getTenantStatus(input.db, tenantId);
  if (!tenantStatus) {
    return deny(404, "TENANT_NOT_FOUND");
  }
  if (action.effect === "WRITE" && tenantStatus !== "ACTIVE") {
    return deny(403, "TENANT_NOT_ACTIVE");
  }

  const membership = await getActiveMembership(input.db, accountId, tenantId);
  if (!membership) {
    return deny(403, "NO_MEMBERSHIP");
  }

  if (Array.isArray(action.allowedRoles) && action.allowedRoles.length > 0) {
    const roleKey = String(membership.role_key ?? "").toUpperCase() as RoleKey;
    if (!action.allowedRoles.includes(roleKey)) {
      return deny(403, "PERMISSION_DENIED");
    }
  }

  if (action.scope === "BRANCH") {
    const branchId = resolveBranchId({
      route: input.route,
      req: input.req,
      claims: input.claims,
    });
    if (!branchId) {
      return deny(403, "BRANCH_CONTEXT_REQUIRED");
    }

    const branchStatus = await getBranchStatus({
      db: input.db,
      tenantId,
      branchId,
    });
    if (!branchStatus) {
      return deny(404, "BRANCH_NOT_FOUND");
    }
    if (action.effect === "WRITE" && branchStatus !== "ACTIVE") {
      return deny(403, "BRANCH_FROZEN");
    }

    const hasAccess = await hasActiveBranchAccess({
      db: input.db,
      accountId,
      tenantId,
      branchId,
    });
    if (!hasAccess) {
      return deny(403, "NO_BRANCH_ACCESS");
    }

    const entitlement = await evaluateEntitlement({
      db: input.db,
      action,
      tenantId,
      branchId,
    });
    if (entitlement === "BLOCKED") {
      return deny(403, "ENTITLEMENT_BLOCKED");
    }
    if (entitlement === "READ_ONLY" && action.effect === "WRITE") {
      return deny(403, "ENTITLEMENT_READ_ONLY");
    }

    return { allow: true };
  }

  const tenantEntitlement = await evaluateEntitlement({
    db: input.db,
    action,
    tenantId,
    branchId: null,
  });
  if (tenantEntitlement === "BLOCKED") {
    return deny(403, "ENTITLEMENT_BLOCKED");
  }
  if (tenantEntitlement === "READ_ONLY" && action.effect === "WRITE") {
    return deny(403, "ENTITLEMENT_READ_ONLY");
  }

  return { allow: true };
}

function deny(statusCode: number, code: string): AuthorizationDecision {
  return { allow: false, statusCode, code };
}

const UPGRADE_ONLY_ACTIONS = new Set<string>([
  "org.branch.activation.initiate",
  "org.branch.activation.confirm",
]);
