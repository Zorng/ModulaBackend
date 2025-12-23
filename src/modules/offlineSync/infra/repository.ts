import type { Pool, PoolClient } from "pg";
import type {
  OfflineSyncOperationRecord,
  OfflineSyncOperationStatus,
  OfflineSyncOperationType,
} from "../domain/entities.js";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

function mapRow(row: any): OfflineSyncOperationRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    clientOpId: row.client_op_id,
    type: row.type as OfflineSyncOperationType,
    status: row.status as OfflineSyncOperationStatus,
    payload:
      row.payload == null
        ? null
        : typeof row.payload === "string"
          ? JSON.parse(row.payload)
          : row.payload,
    result:
      row.result == null
        ? null
        : typeof row.result === "string"
          ? JSON.parse(row.result)
          : row.result,
    errorCode: row.error_code ?? null,
    errorMessage: row.error_message ?? null,
    occurredAt: row.occurred_at ? new Date(row.occurred_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class PgOfflineSyncOperationsRepository {
  constructor(private pool: Pool) {}

  async findByClientOpId(
    params: { tenantId: string; clientOpId: string },
    client?: PoolClient
  ): Promise<OfflineSyncOperationRecord | null> {
    const db: Queryable = client ?? this.pool;
    const res = await db.query(
      `SELECT *
       FROM offline_sync_operations
       WHERE tenant_id = $1 AND client_op_id = $2`,
      [params.tenantId, params.clientOpId]
    );
    if (res.rows.length === 0) return null;
    return mapRow(res.rows[0]);
  }

  async insertProcessing(
    params: {
      tenantId: string;
      branchId: string;
      clientOpId: string;
      type: OfflineSyncOperationType;
      payload: unknown;
      occurredAt?: Date;
    },
    client: PoolClient
  ): Promise<OfflineSyncOperationRecord | null> {
    const res = await client.query(
      `INSERT INTO offline_sync_operations
        (tenant_id, branch_id, client_op_id, type, status, payload, occurred_at)
       VALUES ($1,$2,$3,$4,'PROCESSING',$5,$6)
       ON CONFLICT (tenant_id, client_op_id) DO NOTHING
       RETURNING *`,
      [
        params.tenantId,
        params.branchId,
        params.clientOpId,
        params.type,
        JSON.stringify(params.payload ?? null),
        params.occurredAt ?? null,
      ]
    );
    if (res.rows.length === 0) return null;
    return mapRow(res.rows[0]);
  }

  async markApplied(
    params: { tenantId: string; clientOpId: string; result: unknown },
    client: PoolClient
  ): Promise<void> {
    await client.query(
      `UPDATE offline_sync_operations
       SET status = 'APPLIED',
           result = $3,
           error_code = NULL,
           error_message = NULL,
           updated_at = NOW()
       WHERE tenant_id = $1 AND client_op_id = $2`,
      [params.tenantId, params.clientOpId, JSON.stringify(params.result ?? null)]
    );
  }

  async markFailed(
    params: {
      tenantId: string;
      clientOpId: string;
      errorCode: string;
      errorMessage?: string;
    },
    client: PoolClient
  ): Promise<void> {
    await client.query(
      `UPDATE offline_sync_operations
       SET status = 'FAILED',
           error_code = $3,
           error_message = $4,
           updated_at = NOW()
       WHERE tenant_id = $1 AND client_op_id = $2`,
      [params.tenantId, params.clientOpId, params.errorCode, params.errorMessage ?? null]
    );
  }
}

