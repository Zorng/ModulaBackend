export const V0_PUSH_SYNC_ACTION_KEYS = {
  apply: "pushSync.apply",
  read: "pushSync.read",
} as const;

export const V0_PUSH_SYNC_OPERATION_TYPES = [
  "sale.finalize",
  "cashSession.open",
  "cashSession.movement",
  "cashSession.close",
  "attendance.startWork",
  "attendance.endWork",
] as const;

export type V0PushSyncOperationType =
  (typeof V0_PUSH_SYNC_OPERATION_TYPES)[number];
