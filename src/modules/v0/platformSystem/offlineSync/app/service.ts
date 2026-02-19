import {
  V0OfflineSyncRepository,
  type V0OfflineSyncBatchRow,
  type V0OfflineSyncOperationStatus,
  type V0OfflineSyncOperationRow,
} from "../infra/repository.js";

export type V0OfflineReplayOperationInput = {
  index: number;
  clientOpId: string;
  operationType: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
  payloadHash: string;
};

export class V0OfflineSyncService {
  constructor(private readonly repo: V0OfflineSyncRepository) {}

  createBatch(input: {
    tenantId: string;
    branchId: string;
    submittedByAccountId: string | null;
    haltOnFailure: boolean;
  }): Promise<V0OfflineSyncBatchRow> {
    return this.repo.createBatch(input);
  }

  startOperation(input: {
    batchId: string;
    tenantId: string;
    branchId: string;
    leaseMs: number;
    operation: V0OfflineReplayOperationInput;
  }) {
    return this.repo.tryStartOperation({
      batchId: input.batchId,
      tenantId: input.tenantId,
      branchId: input.branchId,
      clientOpId: input.operation.clientOpId,
      operationIndex: input.operation.index,
      operationType: input.operation.operationType,
      occurredAt: input.operation.occurredAt,
      payload: input.operation.payload,
      payloadHash: input.operation.payloadHash,
      leaseMs: input.leaseMs,
    });
  }

  completeOperation(input: {
    operationId: string;
    status: Exclude<V0OfflineSyncOperationStatus, "IN_PROGRESS">;
    failureCode: string | null;
    failureMessage: string | null;
    resultRefId: string | null;
  }): Promise<V0OfflineSyncOperationRow | null> {
    return this.repo.completeOperation(input);
  }

  findOperationByIdentity(input: {
    tenantId: string;
    branchId: string;
    clientOpId: string;
  }): Promise<V0OfflineSyncOperationRow | null> {
    return this.repo.findOperationByIdentity(input);
  }

  finalizeBatch(input: {
    batchId: string;
    status: "COMPLETED" | "PARTIAL" | "FAILED";
    operationCount: number;
    appliedCount: number;
    duplicateCount: number;
    failedCount: number;
    stoppedAt: number | null;
  }) {
    return this.repo.finalizeBatch(input);
  }

  async getBatchDetail(input: {
    tenantId: string;
    branchId: string;
    batchId: string;
  }) {
    const batch = await this.repo.getBatch(input);
    if (!batch) {
      return null;
    }
    const operations = await this.repo.listBatchOperations({ batchId: batch.id });
    return { batch, operations };
  }
}
