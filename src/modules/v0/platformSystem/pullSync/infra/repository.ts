import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type V0PullSyncChangeOperation = "UPSERT" | "TOMBSTONE";

export type V0PullSyncChangeRow = {
  id: string;
  sequence: string;
  tenant_id: string;
  branch_id: string;
  account_id: string | null;
  module_key: string;
  entity_type: string;
  entity_id: string;
  operation: V0PullSyncChangeOperation;
  revision: string;
  data: Record<string, unknown> | null;
  changed_at: Date;
  source_outbox_id: string | null;
  created_at: Date;
};

export type V0PullSyncCheckpointRow = {
  id: string;
  account_id: string;
  device_id: string;
  tenant_id: string;
  branch_id: string;
  module_scope_hash: string;
  last_sequence: string;
  updated_at: Date;
  created_at: Date;
};

export class V0PullSyncRepository {
  constructor(private readonly db: Queryable) {}

  async listActiveBranchIdsByTenant(tenantId: string): Promise<string[]> {
    const result = await this.db.query<{ id: string }>(
      `SELECT id
       FROM branches
       WHERE tenant_id = $1
         AND status = 'ACTIVE'
       ORDER BY created_at ASC`,
      [tenantId]
    );
    return result.rows.map((row) => row.id);
  }

  async appendChange(input: {
    tenantId: string;
    branchId: string;
    accountId?: string | null;
    moduleKey: string;
    entityType: string;
    entityId: string;
    operation: V0PullSyncChangeOperation;
    revision: string;
    data: Record<string, unknown> | null;
    changedAt: Date;
    sourceOutboxId?: string | null;
  }): Promise<V0PullSyncChangeRow> {
    const result = await this.db.query<V0PullSyncChangeRow>(
      `INSERT INTO v0_sync_changes (
         tenant_id,
         branch_id,
         account_id,
         module_key,
         entity_type,
         entity_id,
         operation,
         revision,
         data,
         changed_at,
         source_outbox_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::JSONB, $10, $11)
       RETURNING
         id,
         sequence::TEXT AS sequence,
         tenant_id,
         branch_id,
         account_id,
         module_key,
         entity_type,
         entity_id,
         operation,
         revision,
         data,
         changed_at,
         source_outbox_id,
         created_at`,
      [
        input.tenantId,
        input.branchId,
        input.accountId ?? null,
        input.moduleKey,
        input.entityType,
        input.entityId,
        input.operation,
        input.revision,
        input.data === null ? null : JSON.stringify(input.data),
        input.changedAt,
        input.sourceOutboxId ?? null,
      ]
    );
    return result.rows[0];
  }

  async listChangesAfterSequence(input: {
    tenantId: string;
    branchId: string;
    accountId: string;
    afterSequence: string;
    moduleKeys: readonly string[];
    limit: number;
  }): Promise<V0PullSyncChangeRow[]> {
    const result = await this.db.query<V0PullSyncChangeRow>(
      `SELECT
         id,
         sequence::TEXT AS sequence,
         tenant_id,
         branch_id,
         account_id,
         module_key,
         entity_type,
         entity_id,
         operation,
         revision,
         data,
         changed_at,
         source_outbox_id,
         created_at
       FROM v0_sync_changes
       WHERE tenant_id = $1
         AND branch_id = $2
         AND (account_id IS NULL OR account_id = $3)
         AND sequence > $4::BIGINT
         AND (
           cardinality($5::VARCHAR[]) = 0 OR
           module_key = ANY($5::VARCHAR[])
         )
       ORDER BY sequence ASC
       LIMIT $6`,
      [
        input.tenantId,
        input.branchId,
        input.accountId,
        input.afterSequence,
        input.moduleKeys,
        input.limit,
      ]
    );
    return result.rows;
  }

  async upsertCheckpoint(input: {
    accountId: string;
    deviceId: string;
    tenantId: string;
    branchId: string;
    moduleScopeHash: string;
    lastSequence: string;
  }): Promise<V0PullSyncCheckpointRow> {
    const result = await this.db.query<V0PullSyncCheckpointRow>(
      `INSERT INTO v0_sync_client_checkpoints (
         account_id,
         device_id,
         tenant_id,
         branch_id,
         module_scope_hash,
         last_sequence
       )
       VALUES ($1, $2, $3, $4, $5, $6::BIGINT)
       ON CONFLICT (account_id, device_id, tenant_id, branch_id, module_scope_hash)
       DO UPDATE SET
         last_sequence = EXCLUDED.last_sequence,
         updated_at = NOW()
       RETURNING
         id,
         account_id,
         device_id,
         tenant_id,
         branch_id,
         module_scope_hash,
         last_sequence::TEXT AS last_sequence,
         updated_at,
         created_at`,
      [
        input.accountId,
        input.deviceId,
        input.tenantId,
        input.branchId,
        input.moduleScopeHash,
        input.lastSequence,
      ]
    );
    return result.rows[0];
  }

  async getCheckpoint(input: {
    accountId: string;
    deviceId: string;
    tenantId: string;
    branchId: string;
    moduleScopeHash: string;
  }): Promise<V0PullSyncCheckpointRow | null> {
    const result = await this.db.query<V0PullSyncCheckpointRow>(
      `SELECT
         id,
         account_id,
         device_id,
         tenant_id,
         branch_id,
         module_scope_hash,
         last_sequence::TEXT AS last_sequence,
         updated_at,
         created_at
       FROM v0_sync_client_checkpoints
       WHERE account_id = $1
         AND device_id = $2
         AND tenant_id = $3
         AND branch_id = $4
         AND module_scope_hash = $5
       LIMIT 1`,
      [
        input.accountId,
        input.deviceId,
        input.tenantId,
        input.branchId,
        input.moduleScopeHash,
      ]
    );
    return result.rows[0] ?? null;
  }
}
