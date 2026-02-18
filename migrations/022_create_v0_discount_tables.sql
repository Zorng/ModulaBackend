-- Discount rollout (Phase 2: data model baseline)
-- Canonical source-of-truth tables for discount rule lifecycle and assignments.

CREATE TABLE IF NOT EXISTS v0_discount_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  percentage NUMERIC(5,2) NOT NULL CHECK (percentage > 0 AND percentage <= 100),
  scope VARCHAR(20) NOT NULL CHECK (scope IN ('ITEM', 'BRANCH_WIDE')),
  status VARCHAR(20) NOT NULL DEFAULT 'INACTIVE'
    CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  stacking_policy VARCHAR(32) NOT NULL DEFAULT 'MULTIPLICATIVE'
    CHECK (stacking_policy IN ('MULTIPLICATIVE')),
  start_at TIMESTAMPTZ NULL,
  end_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  CHECK (start_at IS NULL OR end_at IS NULL OR start_at < end_at)
);

CREATE INDEX IF NOT EXISTS idx_v0_discount_rules_tenant_status_scope
  ON v0_discount_rules(tenant_id, status, scope, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_v0_discount_rules_tenant_schedule
  ON v0_discount_rules(tenant_id, start_at, end_at);

CREATE TABLE IF NOT EXISTS v0_discount_rule_items (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL,
  menu_item_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, rule_id, menu_item_id),
  CONSTRAINT fk_v0_discount_rule_items_rule
    FOREIGN KEY (tenant_id, rule_id)
    REFERENCES v0_discount_rules(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v0_discount_rule_items_menu_item
    FOREIGN KEY (tenant_id, menu_item_id)
    REFERENCES v0_menu_items(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_v0_discount_rule_items_tenant_item
  ON v0_discount_rule_items(tenant_id, menu_item_id, rule_id);

CREATE TABLE IF NOT EXISTS v0_discount_rule_branches (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, rule_id, branch_id),
  CONSTRAINT fk_v0_discount_rule_branches_rule
    FOREIGN KEY (tenant_id, rule_id)
    REFERENCES v0_discount_rules(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v0_discount_rule_branches_branch
    FOREIGN KEY (tenant_id, branch_id)
    REFERENCES branches(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_v0_discount_rule_branches_tenant_branch
  ON v0_discount_rule_branches(tenant_id, branch_id, rule_id);
