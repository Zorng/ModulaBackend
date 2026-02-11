export const OFFLINE_SYNC_OPERATION_TYPES = [
  "SALE_FINALIZED",
  "CASH_SESSION_OPENED",
  "CASH_SESSION_CLOSED",
] as const;

export type OfflineSyncOperationType =
  (typeof OFFLINE_SYNC_OPERATION_TYPES)[number];

export type OfflineSyncOperationStatus = "PROCESSING" | "APPLIED" | "FAILED";

export type OfflineSyncErrorCode =
  | "BRANCH_FROZEN"
  | "VALIDATION_FAILED"
  | "DEPENDENCY_MISSING"
  | "NOT_IMPLEMENTED"
  | "UNKNOWN";

export type OfflineSyncAppliedResult =
  | { type: "SALE_FINALIZED"; saleId: string }
  | { type: "CASH_SESSION_OPENED"; sessionId: string }
  | { type: "CASH_SESSION_CLOSED"; sessionId: string; status: string };

export type OfflineSyncApplyResult = {
  clientOpId: string;
  type: OfflineSyncOperationType;
  status: Exclude<OfflineSyncOperationStatus, "PROCESSING">;
  deduped: boolean;
  result?: OfflineSyncAppliedResult;
  errorCode?: OfflineSyncErrorCode;
  errorMessage?: string;
};

export type OfflineSyncApplyResponse = {
  results: OfflineSyncApplyResult[];
  stoppedAt?: number;
};

export type OfflineSyncOperationInput = {
  clientOpId: string;
  type: OfflineSyncOperationType;
  payload: unknown;
  occurredAt?: Date;
  branchId?: string;
};

export type OfflineSyncOperationRecord = {
  id: string;
  tenantId: string;
  branchId: string;
  clientOpId: string;
  type: OfflineSyncOperationType;
  status: OfflineSyncOperationStatus;
  payload: any;
  result: any;
  errorCode: string | null;
  errorMessage: string | null;
  occurredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

