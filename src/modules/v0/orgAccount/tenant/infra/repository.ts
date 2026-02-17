import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type TenantProfileRow = {
  id: string;
  name: string;
  address: string | null;
  contact_phone: string | null;
  logo_url: string | null;
  status: string;
};

export type V0AccountRow = {
  id: string;
  phone: string;
  status: string;
};

export type V0TenantProvisioningRow = {
  tenant_id: string;
  tenant_name: string;
  tenant_status: string;
  membership_id: string;
  membership_role_key: string;
  membership_status: string;
};

export class V0TenantRepository {
  constructor(private readonly db: Queryable) {}

  async findTenantProfileById(tenantId: string): Promise<TenantProfileRow | null> {
    const result = await this.db.query<TenantProfileRow>(
      `SELECT
         id,
         name,
         address,
         contact_phone,
         logo_url,
         status
       FROM tenants
       WHERE id = $1`,
      [tenantId]
    );
    return result.rows[0] ?? null;
  }

  async findAccountById(accountId: string): Promise<V0AccountRow | null> {
    const result = await this.db.query<V0AccountRow>(
      `SELECT id, phone, status
       FROM accounts
       WHERE id = $1`,
      [accountId]
    );
    return result.rows[0] ?? null;
  }

  async countOwnerTenantMembershipsForAccount(accountId: string): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_tenant_memberships
       WHERE account_id = $1
         AND role_key = 'OWNER'`,
      [accountId]
    );
    return Number(result.rows[0]?.count ?? "0");
  }

  async recordFairUseEventAndCountRecent(input: {
    accountId: string;
    actionKey: string;
    windowSeconds: number;
  }): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `WITH inserted AS (
         INSERT INTO v0_fair_use_events (
           account_id,
           action_key
         )
         VALUES ($1, $2)
         RETURNING created_at
       ),
       recent AS (
         SELECT created_at
         FROM v0_fair_use_events
         WHERE account_id = $1
           AND action_key = $2
           AND created_at >= NOW() - ($3::TEXT || ' seconds')::INTERVAL
         UNION ALL
         SELECT created_at
         FROM inserted
       )
       SELECT COUNT(*)::TEXT AS count
       FROM recent`,
      [input.accountId, input.actionKey, input.windowSeconds]
    );
    return Number(result.rows[0]?.count ?? "0");
  }

  async createTenantWithOwnerMembership(input: {
    accountId: string;
    tenantName: string;
  }): Promise<V0TenantProvisioningRow> {
    const result = await this.db.query<V0TenantProvisioningRow>(
      `WITH inserted_tenant AS (
         INSERT INTO tenants (name, status)
         VALUES ($2, 'ACTIVE')
         RETURNING id, name, status
       ),
       inserted_membership AS (
         INSERT INTO v0_tenant_memberships (
           tenant_id,
           account_id,
           role_key,
           status,
           invited_at,
           accepted_at
         )
         SELECT id, $1, 'OWNER', 'ACTIVE', NOW(), NOW()
         FROM inserted_tenant
         RETURNING id, role_key, status
       ),
       inserted_subscription AS (
         INSERT INTO v0_tenant_subscription_states (tenant_id, state)
         SELECT id, 'ACTIVE'
         FROM inserted_tenant
       )
       SELECT
         t.id AS tenant_id,
         t.name AS tenant_name,
         t.status AS tenant_status,
         m.id AS membership_id,
         m.role_key AS membership_role_key,
         m.status AS membership_status
       FROM inserted_tenant t
       CROSS JOIN inserted_membership m`,
      [input.accountId, input.tenantName]
    );
    return result.rows[0];
  }
}
