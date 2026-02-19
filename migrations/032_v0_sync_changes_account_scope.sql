-- Add optional account scope for private sync changes.
-- Null account_id => branch-wide visible change.
-- Non-null account_id => visible only to that account within tenant/branch context.

ALTER TABLE v0_sync_changes
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_v0_sync_changes_tenant_branch_sequence
  ON v0_sync_changes(tenant_id, branch_id, sequence);

CREATE INDEX IF NOT EXISTS idx_v0_sync_changes_tenant_branch_account_sequence
  ON v0_sync_changes(tenant_id, branch_id, account_id, sequence);
