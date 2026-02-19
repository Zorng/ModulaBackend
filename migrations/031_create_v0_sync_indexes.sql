-- Offline-first OF2: performance indexes for pull sync and checkpoint diagnostics.

CREATE INDEX IF NOT EXISTS idx_v0_sync_changes_scope_sequence
  ON v0_sync_changes(tenant_id, branch_id, sequence ASC);

CREATE INDEX IF NOT EXISTS idx_v0_sync_changes_scope_module_sequence
  ON v0_sync_changes(tenant_id, branch_id, module_key, sequence ASC);

CREATE INDEX IF NOT EXISTS idx_v0_sync_changes_entity_sequence_desc
  ON v0_sync_changes(tenant_id, branch_id, entity_type, entity_id, sequence DESC);

CREATE INDEX IF NOT EXISTS idx_v0_sync_client_checkpoints_scope_updated
  ON v0_sync_client_checkpoints(tenant_id, branch_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_v0_sync_client_checkpoints_account_device
  ON v0_sync_client_checkpoints(account_id, device_id, updated_at DESC);
