import type { ActionMetadata } from "./types.js";
import { getBranchEntitlementEnforcement } from "./data-access.js";
import type { Queryable } from "./types.js";

export type EntitlementDecision = "ALLOW" | "BLOCKED" | "READ_ONLY";

export async function evaluateEntitlement(input: {
  db: Queryable;
  action: ActionMetadata;
  tenantId: string;
  branchId: string | null;
}): Promise<EntitlementDecision> {
  const entitlementKey = input.action.entitlementKey;
  if (!entitlementKey) {
    return "ALLOW";
  }
  if (!input.branchId) {
    return "ALLOW";
  }

  const enforcement = await getBranchEntitlementEnforcement({
    db: input.db,
    tenantId: input.tenantId,
    branchId: input.branchId,
    entitlementKey,
  });
  if (enforcement === "DISABLED_VISIBLE") {
    return "BLOCKED";
  }
  if (enforcement === "READ_ONLY") {
    return "READ_ONLY";
  }
  return "ALLOW";
}
