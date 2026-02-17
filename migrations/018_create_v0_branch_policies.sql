-- Phase O4 / Policy rollout (Phase 2: data model baseline)
-- Branch-scoped policy source-of-truth for tax/currency and pay-later toggle.

CREATE TABLE IF NOT EXISTS v0_branch_policies (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  sale_vat_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sale_vat_rate_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00
    CHECK (sale_vat_rate_percent >= 0 AND sale_vat_rate_percent <= 100),
  sale_fx_rate_khr_per_usd NUMERIC(12,4) NOT NULL DEFAULT 4100.0000
    CHECK (sale_fx_rate_khr_per_usd > 0),
  sale_khr_rounding_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sale_khr_rounding_mode VARCHAR(16) NOT NULL DEFAULT 'NEAREST'
    CHECK (sale_khr_rounding_mode IN ('NEAREST', 'UP', 'DOWN')),
  sale_khr_rounding_granularity INTEGER NOT NULL DEFAULT 100
    CHECK (sale_khr_rounding_granularity IN (100, 1000)),
  sale_allow_pay_later BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_v0_branch_policies_branch
  ON v0_branch_policies(branch_id);

-- Backfill defaults for existing branches.
INSERT INTO v0_branch_policies (tenant_id, branch_id)
SELECT b.tenant_id, b.id
FROM branches b
ON CONFLICT (tenant_id, branch_id) DO NOTHING;

-- Keep INV-POL-3 (default record existence) true for new branches.
CREATE OR REPLACE FUNCTION v0_ensure_branch_policy_defaults()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO v0_branch_policies (tenant_id, branch_id)
  VALUES (NEW.tenant_id, NEW.id)
  ON CONFLICT (tenant_id, branch_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_v0_branch_policy_defaults ON branches;
CREATE TRIGGER trg_v0_branch_policy_defaults
AFTER INSERT ON branches
FOR EACH ROW
EXECUTE FUNCTION v0_ensure_branch_policy_defaults();
