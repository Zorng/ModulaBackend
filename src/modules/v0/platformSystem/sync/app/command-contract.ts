export const V0_SYNC_MODULE_KEYS = [
  "policy",
  "menu",
  "discount",
  "cashSession",
  "attendance",
  "operationalNotification",
] as const;

export type V0SyncModuleKey = (typeof V0_SYNC_MODULE_KEYS)[number];

export const V0_SYNC_CHANGE_OPERATIONS = ["UPSERT", "TOMBSTONE"] as const;

export type V0SyncChangeOperation = (typeof V0_SYNC_CHANGE_OPERATIONS)[number];
