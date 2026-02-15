import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type SubscriptionStateRow = {
  tenant_id: string;
  state: "ACTIVE" | "PAST_DUE" | "FROZEN";
  grace_until: Date | null;
  updated_at: Date;
};

export type BranchEntitlementRow = {
  tenant_id: string;
  branch_id: string;
  entitlement_key: string;
  enforcement: "ENABLED" | "READ_ONLY" | "DISABLED_VISIBLE";
  updated_at: Date;
};

export class V0SubscriptionRepository {
  constructor(private readonly db: Queryable) {}

  async getSubscriptionState(tenantId: string): Promise<SubscriptionStateRow | null> {
    const result = await this.db.query<SubscriptionStateRow>(
      `SELECT tenant_id, state, grace_until, updated_at
       FROM v0_tenant_subscription_states
       WHERE tenant_id = $1`,
      [tenantId]
    );
    return result.rows[0] ?? null;
  }

  async getBranchEntitlement(input: {
    tenantId: string;
    branchId: string;
    entitlementKey: string;
  }): Promise<BranchEntitlementRow | null> {
    const result = await this.db.query<BranchEntitlementRow>(
      `SELECT tenant_id, branch_id, entitlement_key, enforcement, updated_at
       FROM v0_branch_entitlements
       WHERE tenant_id = $1
         AND branch_id = $2
         AND entitlement_key = $3`,
      [input.tenantId, input.branchId, input.entitlementKey]
    );
    return result.rows[0] ?? null;
  }

  async listBranchEntitlements(input: {
    tenantId: string;
    branchId: string;
  }): Promise<BranchEntitlementRow[]> {
    const result = await this.db.query<BranchEntitlementRow>(
      `SELECT tenant_id, branch_id, entitlement_key, enforcement, updated_at
       FROM v0_branch_entitlements
       WHERE tenant_id = $1
         AND branch_id = $2
       ORDER BY entitlement_key ASC`,
      [input.tenantId, input.branchId]
    );
    return result.rows;
  }
}
