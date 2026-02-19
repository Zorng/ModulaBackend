import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type V0OfflineSyncBatchStatus = "IN_PROGRESS" | "COMPLETED" | "PARTIAL" | "FAILED";
export type V0OfflineSyncOperationStatus =
  | "IN_PROGRESS"
  | "APPLIED"
  | "DUPLICATE"
  | "FAILED";

export type V0OfflineSyncBatchRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  submitted_by_account_id: string | null;
  halt_on_failure: boolean;
  status: V0OfflineSyncBatchStatus;
  operation_count: number;
  applied_count: number;
  duplicate_count: number;
  failed_count: number;
  stopped_at: number | null;
  created_at: Date;
  completed_at: Date | null;
};

export type V0OfflineSyncOperationRow = {
  id: string;
  batch_id: string;
  tenant_id: string;
  branch_id: string;
  client_op_id: string;
  operation_index: number;
  operation_type: string;
  occurred_at: Date;
  payload: Record<string, unknown>;
  payload_hash: string;
  status: V0OfflineSyncOperationStatus;
  failure_code: string | null;
  failure_message: string | null;
  result_ref_id: string | null;
  lease_expires_at: Date | null;
  processed_at: Date;
  created_at: Date;
};

export class V0OfflineSyncRepository {
  constructor(private readonly db: Queryable) {}

  async createBatch(input: {
    tenantId: string;
    branchId: string;
    submittedByAccountId: string | null;
    haltOnFailure: boolean;
  }): Promise<V0OfflineSyncBatchRow> {
    const result = await this.db.query<V0OfflineSyncBatchRow>(
      `INSERT INTO v0_offline_sync_batches (
         tenant_id,
         branch_id,
         submitted_by_account_id,
         halt_on_failure
       )
       VALUES ($1, $2, $3, $4)
       RETURNING
         id,
         tenant_id,
         branch_id,
         submitted_by_account_id,
         halt_on_failure,
         status,
         operation_count,
         applied_count,
         duplicate_count,
         failed_count,
         stopped_at,
         created_at,
         completed_at`,
      [input.tenantId, input.branchId, input.submittedByAccountId, input.haltOnFailure]
    );
    return result.rows[0];
  }

  async tryStartOperation(input: {
    batchId: string;
    tenantId: string;
    branchId: string;
    clientOpId: string;
    operationIndex: number;
    operationType: string;
    occurredAt: Date;
    payload: Record<string, unknown>;
    payloadHash: string;
    leaseMs: number;
  }): Promise<{ row: V0OfflineSyncOperationRow; started: boolean; payloadConflict: boolean }> {
    const insertResult = await this.db.query<V0OfflineSyncOperationRow>(
      `INSERT INTO v0_offline_sync_operations (
         batch_id,
         tenant_id,
         branch_id,
         client_op_id,
         operation_index,
         operation_type,
         occurred_at,
         payload,
         payload_hash,
         status,
         lease_expires_at
       )
       VALUES (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         $7,
         $8::JSONB,
         $9,
         'IN_PROGRESS',
         NOW() + ($10::BIGINT * INTERVAL '1 millisecond')
       )
       ON CONFLICT (tenant_id, branch_id, client_op_id) DO NOTHING
       RETURNING
         ${OFFLINE_SYNC_OPERATION_SELECT_FIELDS}`,
      [
        input.batchId,
        input.tenantId,
        input.branchId,
        input.clientOpId,
        input.operationIndex,
        input.operationType,
        input.occurredAt,
        JSON.stringify(input.payload),
        input.payloadHash,
        input.leaseMs,
      ]
    );

    const started = insertResult.rows[0];
    if (started) {
      return { row: started, started: true, payloadConflict: false };
    }

    const existing = await this.findOperationByIdentity({
      tenantId: input.tenantId,
      branchId: input.branchId,
      clientOpId: input.clientOpId,
    });
    if (!existing) {
      throw new Error("offline sync operation conflict detected but existing row not found");
    }

    if (existing.payload_hash !== input.payloadHash) {
      return {
        row: existing,
        started: false,
        payloadConflict: true,
      };
    }

    if (
      existing.status === "IN_PROGRESS" &&
      existing.lease_expires_at &&
      existing.lease_expires_at.getTime() <= Date.now()
    ) {
      const reclaimed = await this.reclaimExpiredInProgressOperation({
        operationId: existing.id,
        batchId: input.batchId,
        operationIndex: input.operationIndex,
        operationType: input.operationType,
        occurredAt: input.occurredAt,
        payload: input.payload,
        payloadHash: input.payloadHash,
        leaseMs: input.leaseMs,
      });
      if (reclaimed) {
        return { row: reclaimed, started: true, payloadConflict: false };
      }

      const latest = await this.findOperationByIdentity({
        tenantId: input.tenantId,
        branchId: input.branchId,
        clientOpId: input.clientOpId,
      });
      if (latest) {
        return {
          row: latest,
          started: false,
          payloadConflict: false,
        };
      }
    }

    return {
      row: existing,
      started: false,
      payloadConflict: false,
    };
  }

  async completeOperation(input: {
    operationId: string;
    status: Exclude<V0OfflineSyncOperationStatus, "IN_PROGRESS">;
    failureCode: string | null;
    failureMessage: string | null;
    resultRefId: string | null;
  }): Promise<V0OfflineSyncOperationRow | null> {
    const result = await this.db.query<V0OfflineSyncOperationRow>(
      `UPDATE v0_offline_sync_operations
       SET status = $2,
           failure_code = $3,
           failure_message = $4,
           result_ref_id = $5,
           lease_expires_at = NULL,
           processed_at = NOW()
       WHERE id = $1
         AND status = 'IN_PROGRESS'
       RETURNING
         ${OFFLINE_SYNC_OPERATION_SELECT_FIELDS}`,
      [
        input.operationId,
        input.status,
        input.failureCode,
        input.failureMessage,
        input.resultRefId,
      ]
    );
    return result.rows[0] ?? null;
  }

  async findOperationByIdentity(input: {
    tenantId: string;
    branchId: string;
    clientOpId: string;
  }): Promise<V0OfflineSyncOperationRow | null> {
    const result = await this.db.query<V0OfflineSyncOperationRow>(
      `SELECT
         ${OFFLINE_SYNC_OPERATION_SELECT_FIELDS}
       FROM v0_offline_sync_operations
       WHERE tenant_id = $1
         AND branch_id = $2
         AND client_op_id = $3
       LIMIT 1`,
      [input.tenantId, input.branchId, input.clientOpId]
    );
    return result.rows[0] ?? null;
  }

  async finalizeBatch(input: {
    batchId: string;
    status: Exclude<V0OfflineSyncBatchStatus, "IN_PROGRESS">;
    operationCount: number;
    appliedCount: number;
    duplicateCount: number;
    failedCount: number;
    stoppedAt: number | null;
  }): Promise<V0OfflineSyncBatchRow | null> {
    const result = await this.db.query<V0OfflineSyncBatchRow>(
      `UPDATE v0_offline_sync_batches
       SET status = $2,
           operation_count = $3,
           applied_count = $4,
           duplicate_count = $5,
           failed_count = $6,
           stopped_at = $7,
           completed_at = NOW()
       WHERE id = $1
       RETURNING
         id,
         tenant_id,
         branch_id,
         submitted_by_account_id,
         halt_on_failure,
         status,
         operation_count,
         applied_count,
         duplicate_count,
         failed_count,
         stopped_at,
         created_at,
         completed_at`,
      [
        input.batchId,
        input.status,
        input.operationCount,
        input.appliedCount,
        input.duplicateCount,
        input.failedCount,
        input.stoppedAt,
      ]
    );
    return result.rows[0] ?? null;
  }

  async getBatch(input: {
    tenantId: string;
    branchId: string;
    batchId: string;
  }): Promise<V0OfflineSyncBatchRow | null> {
    const result = await this.db.query<V0OfflineSyncBatchRow>(
      `SELECT
         id,
         tenant_id,
         branch_id,
         submitted_by_account_id,
         halt_on_failure,
         status,
         operation_count,
         applied_count,
         duplicate_count,
         failed_count,
         stopped_at,
         created_at,
         completed_at
       FROM v0_offline_sync_batches
       WHERE tenant_id = $1
         AND branch_id = $2
         AND id = $3
       LIMIT 1`,
      [input.tenantId, input.branchId, input.batchId]
    );
    return result.rows[0] ?? null;
  }

  async listBatchOperations(input: {
    batchId: string;
  }): Promise<V0OfflineSyncOperationRow[]> {
    const result = await this.db.query<V0OfflineSyncOperationRow>(
      `SELECT
         ${OFFLINE_SYNC_OPERATION_SELECT_FIELDS}
       FROM v0_offline_sync_operations
       WHERE batch_id = $1
       ORDER BY operation_index ASC`,
      [input.batchId]
    );
    return result.rows;
  }

  private async reclaimExpiredInProgressOperation(input: {
    operationId: string;
    batchId: string;
    operationIndex: number;
    operationType: string;
    occurredAt: Date;
    payload: Record<string, unknown>;
    payloadHash: string;
    leaseMs: number;
  }): Promise<V0OfflineSyncOperationRow | null> {
    const result = await this.db.query<V0OfflineSyncOperationRow>(
      `UPDATE v0_offline_sync_operations
       SET batch_id = $2,
           operation_index = $3,
           operation_type = $4,
           occurred_at = $5,
           payload = $6::JSONB,
           status = 'IN_PROGRESS',
           failure_code = NULL,
           failure_message = NULL,
           result_ref_id = NULL,
           lease_expires_at = NOW() + ($7::BIGINT * INTERVAL '1 millisecond'),
           processed_at = NOW()
       WHERE id = $1
         AND status = 'IN_PROGRESS'
         AND lease_expires_at <= NOW()
         AND payload_hash = $8
       RETURNING
         ${OFFLINE_SYNC_OPERATION_SELECT_FIELDS}`,
      [
        input.operationId,
        input.batchId,
        input.operationIndex,
        input.operationType,
        input.occurredAt,
        JSON.stringify(input.payload),
        input.leaseMs,
        input.payloadHash,
      ]
    );
    return result.rows[0] ?? null;
  }
}

const OFFLINE_SYNC_OPERATION_SELECT_FIELDS = `
id,
batch_id,
tenant_id,
branch_id,
client_op_id,
operation_index,
operation_type,
occurred_at,
payload,
payload_hash,
status,
failure_code,
failure_message,
result_ref_id,
lease_expires_at,
processed_at,
created_at`;
