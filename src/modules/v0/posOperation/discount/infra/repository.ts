import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type DiscountRuleStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type DiscountScope = "ITEM" | "BRANCH_WIDE";
export type DiscountStackingPolicy = "MULTIPLICATIVE";

export type DiscountRuleRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  name: string;
  percentage: number;
  scope: DiscountScope;
  status: DiscountRuleStatus;
  stacking_policy: DiscountStackingPolicy;
  start_at: Date | null;
  end_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type DiscountRuleItemRow = {
  tenant_id: string;
  rule_id: string;
  menu_item_id: string;
  created_at: Date;
};

export class V0DiscountRepository {
  constructor(private readonly db: Queryable) {}

  async createRule(input: {
    tenantId: string;
    branchId: string;
    name: string;
    percentage: number;
    scope: DiscountScope;
    status?: DiscountRuleStatus;
    startAt: Date | null;
    endAt: Date | null;
  }): Promise<DiscountRuleRow> {
    const result = await this.db.query<DiscountRuleRow>(
      `INSERT INTO v0_discount_rules (
         tenant_id,
         branch_id,
         name,
         percentage,
         scope,
         status,
         start_at,
         end_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING
         id,
         tenant_id,
         branch_id,
         name,
         percentage::FLOAT8 AS percentage,
         scope,
         status,
         stacking_policy,
         start_at,
         end_at,
         created_at,
         updated_at`,
      [
        input.tenantId,
        input.branchId,
        input.name,
        input.percentage,
        input.scope,
        input.status ?? "INACTIVE",
        input.startAt,
        input.endAt,
      ]
    );
    return result.rows[0];
  }

  async getRuleById(input: {
    tenantId: string;
    ruleId: string;
  }): Promise<DiscountRuleRow | null> {
    const result = await this.db.query<DiscountRuleRow>(
      `${discountRuleSelectSql}
       FROM v0_discount_rules r
       WHERE r.tenant_id = $1
         AND r.id = $2
       LIMIT 1`,
      [input.tenantId, input.ruleId]
    );
    return result.rows[0] ?? null;
  }

  async listRules(input: {
    tenantId: string;
    status?: DiscountRuleStatus | null;
    scope?: DiscountScope | null;
    branchId?: string | null;
    search?: string | null;
    limit: number;
    offset: number;
  }): Promise<DiscountRuleRow[]> {
    const result = await this.db.query<DiscountRuleRow>(
      `${discountRuleSelectSql}
       FROM v0_discount_rules r
       WHERE r.tenant_id = $1
         AND ($2::VARCHAR IS NULL OR r.status = $2)
         AND ($3::VARCHAR IS NULL OR r.scope = $3)
         AND ($4::UUID IS NULL OR r.branch_id = $4)
         AND ($5::TEXT IS NULL OR r.name ILIKE '%' || $5 || '%')
       ORDER BY r.updated_at DESC, r.created_at DESC
       LIMIT $6 OFFSET $7`,
      [
        input.tenantId,
        input.status ?? null,
        input.scope ?? null,
        input.branchId ?? null,
        input.search ?? null,
        input.limit,
        input.offset,
      ]
    );
    return result.rows;
  }

  async countRules(input: {
    tenantId: string;
    status?: DiscountRuleStatus | null;
    scope?: DiscountScope | null;
    branchId?: string | null;
    search?: string | null;
  }): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_discount_rules r
       WHERE r.tenant_id = $1
         AND ($2::VARCHAR IS NULL OR r.status = $2)
         AND ($3::VARCHAR IS NULL OR r.scope = $3)
         AND ($4::UUID IS NULL OR r.branch_id = $4)
         AND ($5::TEXT IS NULL OR r.name ILIKE '%' || $5 || '%')`,
      [
        input.tenantId,
        input.status ?? null,
        input.scope ?? null,
        input.branchId ?? null,
        input.search ?? null,
      ]
    );
    return Number(result.rows[0]?.count ?? "0");
  }

  async updateRuleDefinition(input: {
    tenantId: string;
    ruleId: string;
    name: string;
    percentage: number;
    scope: DiscountScope;
    startAt: Date | null;
    endAt: Date | null;
  }): Promise<DiscountRuleRow | null> {
    const result = await this.db.query<DiscountRuleRow>(
      `UPDATE v0_discount_rules
       SET name = $3,
           percentage = $4,
           scope = $5,
           start_at = $6,
           end_at = $7,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND id = $2
       RETURNING
         id,
         tenant_id,
         branch_id,
         name,
         percentage::FLOAT8 AS percentage,
         scope,
         status,
         stacking_policy,
         start_at,
         end_at,
         created_at,
         updated_at`,
      [
        input.tenantId,
        input.ruleId,
        input.name,
        input.percentage,
        input.scope,
        input.startAt,
        input.endAt,
      ]
    );
    return result.rows[0] ?? null;
  }

  async updateRuleStatus(input: {
    tenantId: string;
    ruleId: string;
    status: DiscountRuleStatus;
  }): Promise<DiscountRuleRow | null> {
    const result = await this.db.query<DiscountRuleRow>(
      `UPDATE v0_discount_rules
       SET status = $3,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND id = $2
       RETURNING
         id,
         tenant_id,
         branch_id,
         name,
         percentage::FLOAT8 AS percentage,
         scope,
         status,
         stacking_policy,
         start_at,
         end_at,
         created_at,
         updated_at`,
      [input.tenantId, input.ruleId, input.status]
    );
    return result.rows[0] ?? null;
  }

  async replaceRuleItems(input: {
    tenantId: string;
    ruleId: string;
    itemIds: readonly string[];
  }): Promise<void> {
    await this.db.query(
      `DELETE FROM v0_discount_rule_items
       WHERE tenant_id = $1
         AND rule_id = $2`,
      [input.tenantId, input.ruleId]
    );

    if (input.itemIds.length === 0) {
      return;
    }

    await this.db.query(
      `INSERT INTO v0_discount_rule_items (tenant_id, rule_id, menu_item_id)
       SELECT $1, $2, item_id
       FROM UNNEST($3::UUID[]) AS item_id
       ON CONFLICT DO NOTHING`,
      [input.tenantId, input.ruleId, input.itemIds]
    );
  }

  async listRuleItemIds(input: {
    tenantId: string;
    ruleId: string;
  }): Promise<string[]> {
    const result = await this.db.query<{ menu_item_id: string }>(
      `SELECT menu_item_id
       FROM v0_discount_rule_items
       WHERE tenant_id = $1
         AND rule_id = $2
       ORDER BY menu_item_id ASC`,
      [input.tenantId, input.ruleId]
    );
    return result.rows.map((row) => row.menu_item_id);
  }

  async listRuleItemsByRuleIds(input: {
    tenantId: string;
    ruleIds: readonly string[];
  }): Promise<DiscountRuleItemRow[]> {
    if (input.ruleIds.length === 0) {
      return [];
    }

    const result = await this.db.query<DiscountRuleItemRow>(
      `SELECT tenant_id, rule_id, menu_item_id, created_at
       FROM v0_discount_rule_items
       WHERE tenant_id = $1
         AND rule_id = ANY($2::UUID[])`,
      [input.tenantId, input.ruleIds]
    );
    return result.rows;
  }

  async listActiveRulesForBranch(input: {
    tenantId: string;
    branchId: string;
    excludeRuleId?: string;
  }): Promise<DiscountRuleRow[]> {
    const result = await this.db.query<DiscountRuleRow>(
      `${discountRuleSelectSql}
       FROM v0_discount_rules r
       WHERE r.tenant_id = $1
         AND r.branch_id = $2
         AND r.status = 'ACTIVE'
         AND ($3::UUID IS NULL OR r.id <> $3)
       ORDER BY r.updated_at DESC, r.created_at DESC`,
      [input.tenantId, input.branchId, input.excludeRuleId ?? null]
    );
    return result.rows;
  }

  async listActiveRulesForBranchAt(input: {
    tenantId: string;
    branchId: string;
    occurredAt: Date;
  }): Promise<DiscountRuleRow[]> {
    const result = await this.db.query<DiscountRuleRow>(
      `${discountRuleSelectSql}
       FROM v0_discount_rules r
       WHERE r.tenant_id = $1
         AND r.branch_id = $2
         AND r.status = 'ACTIVE'
         AND (r.start_at IS NULL OR r.start_at <= $3)
         AND (r.end_at IS NULL OR r.end_at > $3)
       ORDER BY r.updated_at DESC, r.created_at DESC`,
      [input.tenantId, input.branchId, input.occurredAt]
    );
    return result.rows;
  }

  async resolveEligibleItemIdsForBranch(input: {
    tenantId: string;
    branchId: string;
    itemIds: readonly string[];
  }): Promise<string[]> {
    if (input.itemIds.length === 0) {
      return [];
    }

    const result = await this.db.query<{ menu_item_id: string }>(
      `SELECT vis.menu_item_id
       FROM v0_menu_item_branch_visibility vis
       JOIN v0_menu_items mi
         ON mi.tenant_id = vis.tenant_id
        AND mi.id = vis.menu_item_id
       JOIN branches b
         ON b.tenant_id = vis.tenant_id
        AND b.id = vis.branch_id
       WHERE vis.tenant_id = $1
         AND vis.branch_id = $2
         AND vis.menu_item_id = ANY($3::UUID[])
         AND mi.status = 'ACTIVE'
         AND b.status = 'ACTIVE'
       ORDER BY vis.menu_item_id ASC`,
      [input.tenantId, input.branchId, input.itemIds]
    );
    return result.rows.map((row) => row.menu_item_id);
  }

  async branchExistsAndActive(input: {
    tenantId: string;
    branchId: string;
  }): Promise<boolean> {
    const result = await this.db.query<{ ok: number }>(
      `SELECT 1 AS ok
       FROM branches
       WHERE tenant_id = $1
         AND id = $2
         AND status = 'ACTIVE'
       LIMIT 1`,
      [input.tenantId, input.branchId]
    );
    return result.rows.length > 0;
  }
}

const discountRuleSelectSql = `SELECT
  r.id,
  r.tenant_id,
  r.branch_id,
  r.name,
  r.percentage::FLOAT8 AS percentage,
  r.scope,
  r.status,
  r.stacking_policy,
  r.start_at,
  r.end_at,
  r.created_at,
  r.updated_at`;
