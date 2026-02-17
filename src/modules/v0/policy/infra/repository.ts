import type { Pool, PoolClient } from "pg";
import {
  V0_BRANCH_POLICY_DEFAULTS,
  type SaleKhrRoundingGranularity,
  type SaleKhrRoundingMode,
} from "../app/defaults.js";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type BranchPolicyRow = {
  tenant_id: string;
  branch_id: string;
  sale_vat_enabled: boolean;
  sale_vat_rate_percent: number;
  sale_fx_rate_khr_per_usd: number;
  sale_khr_rounding_enabled: boolean;
  sale_khr_rounding_mode: SaleKhrRoundingMode;
  sale_khr_rounding_granularity: SaleKhrRoundingGranularity;
  sale_allow_pay_later: boolean;
  created_at: Date;
  updated_at: Date;
};

export type BranchPolicyPatch = {
  saleVatEnabled?: boolean;
  saleVatRatePercent?: number;
  saleFxRateKhrPerUsd?: number;
  saleKhrRoundingEnabled?: boolean;
  saleKhrRoundingMode?: SaleKhrRoundingMode;
  saleKhrRoundingGranularity?: SaleKhrRoundingGranularity;
  saleAllowPayLater?: boolean;
};

export class V0PolicyRepository {
  constructor(private readonly db: Queryable) {}

  async getBranchPolicy(input: {
    tenantId: string;
    branchId: string;
  }): Promise<BranchPolicyRow | null> {
    const result = await this.db.query<BranchPolicyRow>(
      `SELECT
         tenant_id,
         branch_id,
         sale_vat_enabled,
         sale_vat_rate_percent::FLOAT8 AS sale_vat_rate_percent,
         sale_fx_rate_khr_per_usd::FLOAT8 AS sale_fx_rate_khr_per_usd,
         sale_khr_rounding_enabled,
         sale_khr_rounding_mode,
         sale_khr_rounding_granularity,
         sale_allow_pay_later,
         created_at,
         updated_at
       FROM v0_branch_policies
       WHERE tenant_id = $1
         AND branch_id = $2`,
      [input.tenantId, input.branchId]
    );

    return result.rows[0] ?? null;
  }

  async upsertBranchPolicyPatch(input: {
    tenantId: string;
    branchId: string;
    patch: BranchPolicyPatch;
  }): Promise<BranchPolicyRow | null> {
    const patch = input.patch;
    const result = await this.db.query<BranchPolicyRow>(
      `WITH target_branch AS (
         SELECT id, tenant_id
         FROM branches
         WHERE id = $2
           AND tenant_id = $1
       ),
       upserted AS (
         INSERT INTO v0_branch_policies (
           tenant_id,
           branch_id,
           sale_vat_enabled,
           sale_vat_rate_percent,
           sale_fx_rate_khr_per_usd,
           sale_khr_rounding_enabled,
           sale_khr_rounding_mode,
           sale_khr_rounding_granularity,
           sale_allow_pay_later
         )
         SELECT
           tb.tenant_id,
           tb.id,
           COALESCE($3::BOOLEAN, $10::BOOLEAN),
           COALESCE($4::NUMERIC, $11::NUMERIC),
           COALESCE($5::NUMERIC, $12::NUMERIC),
           COALESCE($6::BOOLEAN, $13::BOOLEAN),
           COALESCE($7::VARCHAR, $14::VARCHAR),
           COALESCE($8::INTEGER, $15::INTEGER),
           COALESCE($9::BOOLEAN, $16::BOOLEAN)
         FROM target_branch tb
         ON CONFLICT (tenant_id, branch_id)
         DO UPDATE SET
           sale_vat_enabled = COALESCE($3::BOOLEAN, v0_branch_policies.sale_vat_enabled),
           sale_vat_rate_percent = COALESCE($4::NUMERIC, v0_branch_policies.sale_vat_rate_percent),
           sale_fx_rate_khr_per_usd = COALESCE($5::NUMERIC, v0_branch_policies.sale_fx_rate_khr_per_usd),
           sale_khr_rounding_enabled = COALESCE($6::BOOLEAN, v0_branch_policies.sale_khr_rounding_enabled),
           sale_khr_rounding_mode = COALESCE($7::VARCHAR, v0_branch_policies.sale_khr_rounding_mode),
           sale_khr_rounding_granularity = COALESCE($8::INTEGER, v0_branch_policies.sale_khr_rounding_granularity),
           sale_allow_pay_later = COALESCE($9::BOOLEAN, v0_branch_policies.sale_allow_pay_later),
           updated_at = NOW()
         RETURNING
           tenant_id,
           branch_id,
           sale_vat_enabled,
           sale_vat_rate_percent::FLOAT8 AS sale_vat_rate_percent,
           sale_fx_rate_khr_per_usd::FLOAT8 AS sale_fx_rate_khr_per_usd,
           sale_khr_rounding_enabled,
           sale_khr_rounding_mode,
           sale_khr_rounding_granularity,
           sale_allow_pay_later,
           created_at,
           updated_at
       )
       SELECT
         tenant_id,
         branch_id,
         sale_vat_enabled,
         sale_vat_rate_percent,
         sale_fx_rate_khr_per_usd,
         sale_khr_rounding_enabled,
         sale_khr_rounding_mode,
         sale_khr_rounding_granularity,
         sale_allow_pay_later,
         created_at,
         updated_at
       FROM upserted`,
      [
        input.tenantId,
        input.branchId,
        patch.saleVatEnabled ?? null,
        patch.saleVatRatePercent ?? null,
        patch.saleFxRateKhrPerUsd ?? null,
        patch.saleKhrRoundingEnabled ?? null,
        patch.saleKhrRoundingMode ?? null,
        patch.saleKhrRoundingGranularity ?? null,
        patch.saleAllowPayLater ?? null,
        V0_BRANCH_POLICY_DEFAULTS.saleVatEnabled,
        V0_BRANCH_POLICY_DEFAULTS.saleVatRatePercent,
        V0_BRANCH_POLICY_DEFAULTS.saleFxRateKhrPerUsd,
        V0_BRANCH_POLICY_DEFAULTS.saleKhrRoundingEnabled,
        V0_BRANCH_POLICY_DEFAULTS.saleKhrRoundingMode,
        V0_BRANCH_POLICY_DEFAULTS.saleKhrRoundingGranularity,
        V0_BRANCH_POLICY_DEFAULTS.saleAllowPayLater,
      ]
    );

    return result.rows[0] ?? null;
  }

  async ensureDefaultPolicyForBranch(input: {
    tenantId: string;
    branchId: string;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO v0_branch_policies (
         tenant_id,
         branch_id
       )
       SELECT b.tenant_id, b.id
       FROM branches b
       WHERE b.tenant_id = $1
         AND b.id = $2
       ON CONFLICT (tenant_id, branch_id)
       DO NOTHING`,
      [input.tenantId, input.branchId]
    );
  }
}
