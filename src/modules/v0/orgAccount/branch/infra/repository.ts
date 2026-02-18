import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type BranchProfileRow = {
  id: string;
  tenant_id: string;
  name: string;
  address: string | null;
  contact_phone: string | null;
  status: string;
};

export type FirstBranchActivationDraftRow = {
  draft_id: string;
  tenant_id: string;
  requested_by_account_id: string;
  branch_display_name: string;
  draft_status: "PENDING_PAYMENT" | "ACTIVATED" | "CANCELLED";
  activated_branch_id: string | null;
  payment_confirmation_ref: string | null;
  created_at: Date;
  updated_at: Date;
  activated_at: Date | null;
  invoice_id: string;
  invoice_status: "ISSUED" | "PAID" | "VOID" | "FAILED";
  invoice_currency: "USD";
  invoice_total_amount_usd: string;
  invoice_issued_at: Date;
  invoice_paid_at: Date | null;
};

export class V0BranchRepository {
  constructor(private readonly db: Queryable) {}

  async lockTenantForFirstBranchActivation(tenantId: string): Promise<void> {
    await this.db.query(
      `SELECT id
       FROM tenants
       WHERE id = $1
       FOR UPDATE`,
      [tenantId]
    );
  }

  async countBranchesByTenant(tenantId: string): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM branches
       WHERE tenant_id = $1`,
      [tenantId]
    );
    return Number(result.rows[0]?.count ?? "0");
  }

  async createActiveBranch(input: {
    tenantId: string;
    branchName: string;
  }): Promise<BranchProfileRow> {
    const result = await this.db.query<BranchProfileRow>(
      `INSERT INTO branches (tenant_id, name, status)
       VALUES ($1, $2, 'ACTIVE')
       RETURNING
         id,
         tenant_id,
         name,
         address,
         contact_phone,
         status`,
      [input.tenantId, input.branchName]
    );
    return result.rows[0];
  }

  async findActiveMembershipId(input: {
    tenantId: string;
    accountId: string;
  }): Promise<string | null> {
    const result = await this.db.query<{ id: string }>(
      `SELECT id
       FROM v0_tenant_memberships
       WHERE tenant_id = $1
         AND account_id = $2
         AND status = 'ACTIVE'
       LIMIT 1`,
      [input.tenantId, input.accountId]
    );
    return result.rows[0]?.id ?? null;
  }

  async assignActiveBranch(input: {
    tenantId: string;
    branchId: string;
    accountId: string;
    membershipId: string;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO v0_branch_assignments (
         tenant_id,
         branch_id,
         account_id,
         membership_id,
         status,
         assigned_at
       ) VALUES ($1, $2, $3, $4, 'ACTIVE', NOW())
       ON CONFLICT (tenant_id, branch_id, account_id)
       DO UPDATE SET
         membership_id = EXCLUDED.membership_id,
         status = 'ACTIVE',
         revoked_at = NULL,
         updated_at = NOW()`,
      [input.tenantId, input.branchId, input.accountId, input.membershipId]
    );
  }

  async seedDefaultBranchEntitlements(input: {
    tenantId: string;
    branchId: string;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO v0_branch_entitlements (
         tenant_id,
         branch_id,
         entitlement_key,
         enforcement
       )
       VALUES
         ($1, $2, 'core.pos', 'ENABLED'),
         ($1, $2, 'module.workforce', 'ENABLED'),
         ($1, $2, 'module.inventory', 'ENABLED'),
         ($1, $2, 'addon.workforce.gps_verification', 'DISABLED_VISIBLE')
       ON CONFLICT (tenant_id, branch_id, entitlement_key)
       DO UPDATE SET
         enforcement = EXCLUDED.enforcement,
         updated_at = NOW()`,
      [input.tenantId, input.branchId]
    );
  }

  async findPendingFirstBranchActivationDraft(
    tenantId: string
  ): Promise<FirstBranchActivationDraftRow | null> {
    const result = await this.db.query<FirstBranchActivationDraftRow>(
      `SELECT
         d.id AS draft_id,
         d.tenant_id,
         d.requested_by_account_id,
         d.branch_display_name,
         d.status AS draft_status,
         d.activated_branch_id,
         d.payment_confirmation_ref,
         d.created_at,
         d.updated_at,
         d.activated_at,
         i.id AS invoice_id,
         i.status AS invoice_status,
         i.currency AS invoice_currency,
         i.total_amount_usd::TEXT AS invoice_total_amount_usd,
         i.issued_at AS invoice_issued_at,
         i.paid_at AS invoice_paid_at
       FROM v0_branch_activation_drafts d
       JOIN v0_subscription_invoices i ON i.id = d.invoice_id
       WHERE d.tenant_id = $1
         AND d.status = 'PENDING_PAYMENT'
       LIMIT 1`,
      [tenantId]
    );
    return result.rows[0] ?? null;
  }

  async createFirstBranchActivationDraftWithInvoice(input: {
    tenantId: string;
    requestedByAccountId: string;
    branchDisplayName: string;
    totalAmountUsd: string;
  }): Promise<FirstBranchActivationDraftRow> {
    const result = await this.db.query<FirstBranchActivationDraftRow>(
      `WITH inserted_invoice AS (
         INSERT INTO v0_subscription_invoices (
           tenant_id,
           invoice_type,
           status,
           currency,
           total_amount_usd,
           metadata,
           issued_at
         )
         VALUES (
           $1,
           'FIRST_BRANCH_ACTIVATION',
           'ISSUED',
           'USD',
           $4::NUMERIC(12,2),
           jsonb_build_object('branchDisplayName', $3::TEXT),
           NOW()
         )
         RETURNING *
       ),
       inserted_draft AS (
         INSERT INTO v0_branch_activation_drafts (
           tenant_id,
           requested_by_account_id,
           branch_display_name,
           status,
           invoice_id
         )
         SELECT
           $1,
           $2,
           $3,
           'PENDING_PAYMENT',
           i.id
         FROM inserted_invoice i
         RETURNING *
       )
       SELECT
         d.id AS draft_id,
         d.tenant_id,
         d.requested_by_account_id,
         d.branch_display_name,
         d.status AS draft_status,
         d.activated_branch_id,
         d.payment_confirmation_ref,
         d.created_at,
         d.updated_at,
         d.activated_at,
         i.id AS invoice_id,
         i.status AS invoice_status,
         i.currency AS invoice_currency,
         i.total_amount_usd::TEXT AS invoice_total_amount_usd,
         i.issued_at AS invoice_issued_at,
         i.paid_at AS invoice_paid_at
       FROM inserted_draft d
       JOIN inserted_invoice i ON i.id = d.invoice_id`,
      [
        input.tenantId,
        input.requestedByAccountId,
        input.branchDisplayName,
        input.totalAmountUsd,
      ]
    );
    return result.rows[0];
  }

  async findFirstBranchActivationDraftById(input: {
    tenantId: string;
    draftId: string;
    forUpdate?: boolean;
  }): Promise<FirstBranchActivationDraftRow | null> {
    const forUpdateClause = input.forUpdate ? "FOR UPDATE OF d" : "";
    const result = await this.db.query<FirstBranchActivationDraftRow>(
      `SELECT
         d.id AS draft_id,
         d.tenant_id,
         d.requested_by_account_id,
         d.branch_display_name,
         d.status AS draft_status,
         d.activated_branch_id,
         d.payment_confirmation_ref,
         d.created_at,
         d.updated_at,
         d.activated_at,
         i.id AS invoice_id,
         i.status AS invoice_status,
         i.currency AS invoice_currency,
         i.total_amount_usd::TEXT AS invoice_total_amount_usd,
         i.issued_at AS invoice_issued_at,
         i.paid_at AS invoice_paid_at
       FROM v0_branch_activation_drafts d
       JOIN v0_subscription_invoices i ON i.id = d.invoice_id
       WHERE d.tenant_id = $1
         AND d.id = $2
       ${forUpdateClause}`,
      [input.tenantId, input.draftId]
    );
    return result.rows[0] ?? null;
  }

  async markInvoicePaid(invoiceId: string): Promise<void> {
    await this.db.query(
      `UPDATE v0_subscription_invoices
       SET
         status = 'PAID',
         paid_at = COALESCE(paid_at, NOW()),
         updated_at = NOW()
       WHERE id = $1`,
      [invoiceId]
    );
  }

  async markDraftActivated(input: {
    draftId: string;
    branchId: string;
    paymentConfirmationRef: string | null;
  }): Promise<void> {
    await this.db.query(
      `UPDATE v0_branch_activation_drafts
       SET
         status = 'ACTIVATED',
         activated_branch_id = $2,
         payment_confirmation_ref = $3,
         activated_at = COALESCE(activated_at, NOW()),
         updated_at = NOW()
       WHERE id = $1`,
      [input.draftId, input.branchId, input.paymentConfirmationRef]
    );
  }

  async findBranchProfile(input: {
    tenantId: string;
    branchId: string;
  }): Promise<BranchProfileRow | null> {
    const result = await this.db.query<BranchProfileRow>(
      `SELECT
         id,
         tenant_id,
         name,
         address,
         contact_phone,
         status
       FROM branches
       WHERE id = $1
         AND tenant_id = $2`,
      [input.branchId, input.tenantId]
    );
    return result.rows[0] ?? null;
  }

  async hasActiveBranchAssignment(input: {
    accountId: string;
    tenantId: string;
    branchId: string;
  }): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM v0_branch_assignments ba
         JOIN v0_tenant_memberships m ON m.id = ba.membership_id
         WHERE ba.account_id = $1
           AND ba.tenant_id = $2
           AND ba.branch_id = $3
           AND ba.status = 'ACTIVE'
           AND m.account_id = $1
           AND m.tenant_id = $2
           AND m.status = 'ACTIVE'
       ) AS exists`,
      [input.accountId, input.tenantId, input.branchId]
    );
    return result.rows[0]?.exists === true;
  }

  async listAccessibleBranches(input: {
    accountId: string;
    tenantId: string;
  }): Promise<BranchProfileRow[]> {
    const result = await this.db.query<BranchProfileRow>(
      `SELECT
         b.id,
         b.tenant_id,
         b.name,
         b.address,
         b.contact_phone,
         b.status
       FROM v0_branch_assignments ba
       JOIN v0_tenant_memberships m ON m.id = ba.membership_id
       JOIN branches b ON b.id = ba.branch_id
       WHERE ba.account_id = $1
         AND ba.tenant_id = $2
         AND ba.status = 'ACTIVE'
         AND m.account_id = $1
         AND m.tenant_id = $2
         AND m.status = 'ACTIVE'
         AND b.tenant_id = $2
       ORDER BY b.name ASC, b.id ASC`,
      [input.accountId, input.tenantId]
    );
    return result.rows;
  }
}
