export const V0_OFFLINE_SYNC_ACTION_KEYS = {
  replayApply: "offlineSync.replay.apply",
  replayRead: "offlineSync.replay.read",
} as const;

export const V0_OFFLINE_SYNC_OPERATION_TYPES = [
  "sale.finalize",
  "cashSession.open",
  "cashSession.movement",
  "cashSession.close",
  "attendance.startWork",
  "attendance.endWork",
] as const;

export type V0OfflineSyncOperationType =
  (typeof V0_OFFLINE_SYNC_OPERATION_TYPES)[number];

