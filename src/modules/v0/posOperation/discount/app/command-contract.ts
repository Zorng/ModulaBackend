import {
  buildCommandDedupeKey,
  type CommandOutcome,
} from "../../../../../shared/utils/dedupe.js";

export type DiscountCommandOutcome = CommandOutcome;

export const V0_DISCOUNT_ACTION_KEYS = {
  listRules: "discount.rules.list",
  readRule: "discount.rules.read",
  createRule: "discount.rules.create",
  updateRule: "discount.rules.update",
  activateRule: "discount.rules.activate",
  deactivateRule: "discount.rules.deactivate",
  archiveRule: "discount.rules.archive",
  preflightEligibleItems: "discount.rules.preflight.eligibleItems",
  resolveEligibility: "discount.eligibility.resolve",
} as const;

export const V0_DISCOUNT_EVENT_TYPES = {
  ruleCreated: "DISCOUNT_RULE_CREATED",
  ruleUpdated: "DISCOUNT_RULE_UPDATED",
  ruleActivated: "DISCOUNT_RULE_ACTIVATED",
  ruleDeactivated: "DISCOUNT_RULE_DEACTIVATED",
  ruleArchived: "DISCOUNT_RULE_ARCHIVED",
} as const;

export const V0_DISCOUNT_IDEMPOTENCY_SCOPE = {
  tenantWriteActions: [
    V0_DISCOUNT_ACTION_KEYS.createRule,
    V0_DISCOUNT_ACTION_KEYS.updateRule,
    V0_DISCOUNT_ACTION_KEYS.activateRule,
    V0_DISCOUNT_ACTION_KEYS.deactivateRule,
    V0_DISCOUNT_ACTION_KEYS.archiveRule,
  ] as const,
} as const;

export function buildDiscountCommandDedupeKey(
  actionKey: string,
  idempotencyKey: string | null | undefined,
  outcome: DiscountCommandOutcome,
  parts?: ReadonlyArray<unknown>
): string | null {
  return buildCommandDedupeKey({
    actionKey,
    idempotencyKey,
    outcome,
    parts,
  });
}
