import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type IdempotencyRecordRow = {
  id: string;
  scope_fingerprint: string;
  tenant_id: string;
  branch_id: string | null;
  action_key: string;
  idempotency_key: string;
  payload_hash: string;
  status: "PROCESSING" | "COMPLETED";
  response_status: number | null;
  response_body: unknown;
  created_at: Date;
  updated_at: Date;
};

export class V0IdempotencyRepository {
  constructor(private readonly db: Queryable) {}

  async tryStart(input: {
    scopeFingerprint: string;
    tenantId: string;
    branchId: string | null;
    actionKey: string;
    idempotencyKey: string;
    payloadHash: string;
  }): Promise<{ started: true; record: IdempotencyRecordRow } | { started: false }> {
    const inserted = await this.db.query<IdempotencyRecordRow>(
      `INSERT INTO v0_idempotency_records (
         scope_fingerprint,
         tenant_id,
         branch_id,
         action_key,
         idempotency_key,
         payload_hash,
         status
       ) VALUES ($1, $2, $3, $4, $5, $6, 'PROCESSING')
       ON CONFLICT (scope_fingerprint, action_key, idempotency_key) DO NOTHING
       RETURNING *`,
      [
        input.scopeFingerprint,
        input.tenantId,
        input.branchId,
        input.actionKey,
        input.idempotencyKey,
        input.payloadHash,
      ]
    );
    if (inserted.rows[0]) {
      return { started: true, record: inserted.rows[0] };
    }
    return { started: false };
  }

  async findExisting(input: {
    scopeFingerprint: string;
    actionKey: string;
    idempotencyKey: string;
  }): Promise<IdempotencyRecordRow | null> {
    const result = await this.db.query<IdempotencyRecordRow>(
      `SELECT *
       FROM v0_idempotency_records
       WHERE scope_fingerprint = $1
         AND action_key = $2
         AND idempotency_key = $3
       LIMIT 1`,
      [input.scopeFingerprint, input.actionKey, input.idempotencyKey]
    );
    return result.rows[0] ?? null;
  }

  async complete(input: {
    recordId: string;
    responseStatus: number;
    responseBody: unknown;
  }): Promise<void> {
    await this.db.query(
      `UPDATE v0_idempotency_records
       SET
         status = 'COMPLETED',
         response_status = $2,
         response_body = $3::jsonb,
         updated_at = NOW()
       WHERE id = $1`,
      [input.recordId, input.responseStatus, JSON.stringify(input.responseBody)]
    );
  }

  async clearProcessing(recordId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM v0_idempotency_records
       WHERE id = $1
         AND status = 'PROCESSING'`,
      [recordId]
    );
  }
}
