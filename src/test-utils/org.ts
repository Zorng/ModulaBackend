import type { Pool } from "pg";

export async function createActiveBranch(input: {
  pool: Pool;
  tenantId: string;
  branchName: string;
  address?: string | null;
  contactPhone?: string | null;
  khqrReceiverAccountId?: string | null;
  khqrReceiverName?: string | null;
}): Promise<string> {
  const result = await input.pool.query<{ id: string }>(
    `INSERT INTO branches (
       tenant_id,
       name,
       status,
       address,
       contact_phone,
       khqr_receiver_account_id,
       khqr_receiver_name
     )
     VALUES ($1, $2, 'ACTIVE', $3, $4, $5, $6)
     RETURNING id`,
    [
      input.tenantId,
      input.branchName,
      input.address ?? null,
      input.contactPhone ?? null,
      input.khqrReceiverAccountId ?? null,
      input.khqrReceiverName ?? null,
    ]
  );
  return result.rows[0].id;
}

export async function findActiveOwnerMembershipId(input: {
  pool: Pool;
  tenantId: string;
  accountId: string;
}): Promise<string> {
  const result = await input.pool.query<{ id: string }>(
    `SELECT id
     FROM v0_tenant_memberships
     WHERE tenant_id = $1
       AND account_id = $2
       AND role_key = 'OWNER'
       AND status = 'ACTIVE'
     LIMIT 1`,
    [input.tenantId, input.accountId]
  );
  const membershipId = result.rows[0]?.id;
  if (!membershipId) {
    throw new Error("active owner membership not found");
  }
  return membershipId;
}

export async function assignActiveBranch(input: {
  pool: Pool;
  tenantId: string;
  branchId: string;
  accountId: string;
  membershipId: string;
}): Promise<void> {
  await input.pool.query(
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

export async function seedDefaultBranchEntitlements(input: {
  pool: Pool;
  tenantId: string;
  branchId: string;
}): Promise<void> {
  await input.pool.query(
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
