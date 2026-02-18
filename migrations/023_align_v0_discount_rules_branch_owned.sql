-- Align Discount to branch-owned policy (KB lock 2026-02-18)
-- Rules now own a single immutable branch_id; branch assignment table is removed.

CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_tenant_id_id
  ON branches(tenant_id, id);

ALTER TABLE v0_discount_rules
  ADD COLUMN IF NOT EXISTS branch_id UUID;

UPDATE v0_discount_rules r
SET branch_id = chosen.branch_id
FROM (
  SELECT DISTINCT ON (tenant_id, rule_id)
    tenant_id,
    rule_id,
    branch_id
  FROM v0_discount_rule_branches
  ORDER BY tenant_id, rule_id, created_at ASC
) AS chosen
WHERE r.tenant_id = chosen.tenant_id
  AND r.id = chosen.rule_id
  AND r.branch_id IS NULL;

ALTER TABLE v0_discount_rules
  ALTER COLUMN branch_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_v0_discount_rules_branch'
  ) THEN
    ALTER TABLE v0_discount_rules
      ADD CONSTRAINT fk_v0_discount_rules_branch
      FOREIGN KEY (tenant_id, branch_id)
      REFERENCES branches(tenant_id, id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_v0_discount_rules_tenant_branch_status
  ON v0_discount_rules(tenant_id, branch_id, status, updated_at DESC);

DROP TABLE IF EXISTS v0_discount_rule_branches;
