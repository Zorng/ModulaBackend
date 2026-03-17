ALTER TABLE v0_branch_policies
ADD COLUMN IF NOT EXISTS sale_allow_manual_external_payment_claim BOOLEAN NOT NULL DEFAULT FALSE;
