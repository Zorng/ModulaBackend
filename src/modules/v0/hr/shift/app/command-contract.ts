import { buildCommandDedupeKey, type CommandOutcome } from "../../../../../shared/utils/dedupe.js";

export const V0_SHIFT_ACTION_KEYS = {
  createPattern: "hr.shift.pattern.create",
  updatePattern: "hr.shift.pattern.update",
  deactivatePattern: "hr.shift.pattern.deactivate",
  createInstance: "hr.shift.instance.create",
  updateInstance: "hr.shift.instance.update",
  cancelInstance: "hr.shift.instance.cancel",
  scheduleRead: "hr.shift.schedule.read",
  scheduleReadSelf: "hr.shift.schedule.readSelf",
} as const;

export const V0_SHIFT_EVENT_TYPES = {
  patternCreated: "HR_SHIFT_PATTERN_CREATED",
  patternUpdated: "HR_SHIFT_PATTERN_UPDATED",
  patternDeactivated: "HR_SHIFT_PATTERN_DEACTIVATED",
  instanceCreated: "HR_SHIFT_INSTANCE_CREATED",
  instanceUpdated: "HR_SHIFT_INSTANCE_UPDATED",
  instanceCancelled: "HR_SHIFT_INSTANCE_CANCELLED",
  commandRejected: "HR_SHIFT_COMMAND_REJECTED",
  workReviewEvaluationRequested: "HR_WORK_REVIEW_EVALUATION_REQUESTED",
} as const;

export const V0_SHIFT_IDEMPOTENCY_SCOPE = "TENANT" as const;

export function buildShiftCommandDedupeKey(
  actionKey: string,
  idempotencyKey: string | null,
  outcome: CommandOutcome
): string | null {
  return buildCommandDedupeKey({
    actionKey,
    idempotencyKey,
    outcome,
  });
}
