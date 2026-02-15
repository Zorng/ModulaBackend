import type { ActionMetadata } from "./types.js";

export type EntitlementDecision = "ALLOW" | "BLOCKED" | "READ_ONLY";

export function evaluateEntitlement(_input: {
  action: ActionMetadata;
  tenantId: string;
  branchId: string | null;
}): EntitlementDecision {
  // Phase F2: entitlement integration seam only.
  // Real entitlement enforcement lands in F3.
  return "ALLOW";
}
