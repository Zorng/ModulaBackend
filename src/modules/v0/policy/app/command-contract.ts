import {
  buildCommandDedupeKey,
  type CommandOutcome,
} from "../../../../shared/utils/dedupe.js";

export type PolicyCommandOutcome = CommandOutcome;

export const V0_POLICY_ACTION_KEYS = {
  readCurrentBranch: "policy.currentBranch.read",
  updateCurrentBranch: "policy.currentBranch.update",
} as const;

export const V0_POLICY_EVENT_TYPES = {
  updated: "POLICY_UPDATED",
  resetToDefault: "POLICY_RESET_TO_DEFAULT",
} as const;

export function buildPolicyCommandDedupeKey(
  actionKey: string,
  idempotencyKey: string | null | undefined,
  outcome: PolicyCommandOutcome
): string | null {
  return buildCommandDedupeKey({ actionKey, idempotencyKey, outcome });
}
