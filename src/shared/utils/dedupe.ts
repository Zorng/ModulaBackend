import { normalizeOptionalString } from "./string.js";

export type CommandOutcome = "SUCCESS" | "REJECTED" | "FAILED";

export function buildCommandDedupeKey(input: {
  actionKey: string;
  idempotencyKey: string | null | undefined;
  outcome: CommandOutcome;
  parts?: ReadonlyArray<unknown>;
}): string | null {
  const key = normalizeOptionalString(input.idempotencyKey);
  if (!key) {
    return null;
  }

  const extraParts =
    input.parts
      ?.map((value) => normalizeOptionalString(value))
      .filter((value): value is string => Boolean(value)) ?? [];

  return [input.actionKey, input.outcome, ...extraParts, key].join(":");
}
