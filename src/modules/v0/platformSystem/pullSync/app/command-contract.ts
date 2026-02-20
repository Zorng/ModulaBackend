export const V0_PULL_SYNC_MODULE_KEYS = [
  "policy",
  "menu",
  "discount",
  "inventory",
  "cashSession",
  "attendance",
  "operationalNotification",
] as const;

export type V0PullSyncModuleKey = (typeof V0_PULL_SYNC_MODULE_KEYS)[number];

export const V0_PULL_SYNC_CHANGE_OPERATIONS = ["UPSERT", "TOMBSTONE"] as const;

export type V0PullSyncChangeOperation =
  (typeof V0_PULL_SYNC_CHANGE_OPERATIONS)[number];
