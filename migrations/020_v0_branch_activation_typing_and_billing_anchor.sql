-- Phase S2 (Branch billable workspace data model)
-- Add first-vs-additional activation typing and first-activation billing anchor metadata.

ALTER TABLE v0_subscription_invoices
  DROP CONSTRAINT IF EXISTS v0_subscription_invoices_invoice_type_check;

ALTER TABLE v0_subscription_invoices
  ADD CONSTRAINT v0_subscription_invoices_invoice_type_check
  CHECK (invoice_type IN ('FIRST_BRANCH_ACTIVATION', 'ADDITIONAL_BRANCH_ACTIVATION'));

ALTER TABLE v0_branch_activation_drafts
  ADD COLUMN IF NOT EXISTS activation_type VARCHAR(30);

UPDATE v0_branch_activation_drafts
SET activation_type = 'FIRST_BRANCH'
WHERE activation_type IS NULL;

ALTER TABLE v0_branch_activation_drafts
  ALTER COLUMN activation_type SET NOT NULL;

ALTER TABLE v0_branch_activation_drafts
  DROP CONSTRAINT IF EXISTS v0_branch_activation_drafts_activation_type_check;

ALTER TABLE v0_branch_activation_drafts
  ADD CONSTRAINT v0_branch_activation_drafts_activation_type_check
  CHECK (activation_type IN ('FIRST_BRANCH', 'ADDITIONAL_BRANCH'));

CREATE INDEX IF NOT EXISTS idx_v0_branch_activation_drafts_tenant_activation_type
  ON v0_branch_activation_drafts(tenant_id, activation_type, created_at DESC);

ALTER TABLE v0_tenant_subscription_states
  ADD COLUMN IF NOT EXISTS billing_anchor_set_at TIMESTAMPTZ;
