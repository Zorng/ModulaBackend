-- Menu rollout (Phase 2: data model baseline)
-- Canonical source-of-truth tables for menu catalog, modifiers, visibility, and composition metadata.

-- Support composite tenant-scoped foreign keys where needed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_tenant_id_id
  ON branches(tenant_id, id);

CREATE TABLE IF NOT EXISTS v0_menu_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_v0_menu_categories_tenant_status
  ON v0_menu_categories(tenant_id, status);

CREATE TABLE IF NOT EXISTS v0_menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  base_price NUMERIC(12,2) NOT NULL CHECK (base_price >= 0),
  category_id UUID NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  image_url TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  CONSTRAINT fk_v0_menu_items_category
    FOREIGN KEY (tenant_id, category_id)
    REFERENCES v0_menu_categories(tenant_id, id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_v0_menu_items_tenant_status
  ON v0_menu_items(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_v0_menu_items_category
  ON v0_menu_items(tenant_id, category_id);

CREATE TABLE IF NOT EXISTS v0_menu_item_branch_visibility (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, menu_item_id, branch_id),
  CONSTRAINT fk_v0_menu_visibility_item
    FOREIGN KEY (tenant_id, menu_item_id)
    REFERENCES v0_menu_items(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v0_menu_visibility_branch
    FOREIGN KEY (tenant_id, branch_id)
    REFERENCES branches(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_v0_menu_visibility_branch
  ON v0_menu_item_branch_visibility(tenant_id, branch_id);

CREATE TABLE IF NOT EXISTS v0_menu_modifier_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  selection_mode VARCHAR(16) NOT NULL
    CHECK (selection_mode IN ('SINGLE', 'MULTI')),
  min_selections INTEGER NOT NULL DEFAULT 0 CHECK (min_selections >= 0),
  max_selections INTEGER NOT NULL DEFAULT 1 CHECK (max_selections >= 0),
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, name),
  CHECK (max_selections >= min_selections),
  CHECK (
    (is_required = FALSE) OR
    (is_required = TRUE AND min_selections >= 1)
  )
);

CREATE INDEX IF NOT EXISTS idx_v0_menu_modifier_groups_tenant_status
  ON v0_menu_modifier_groups(tenant_id, status);

CREATE TABLE IF NOT EXISTS v0_menu_modifier_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  modifier_group_id UUID NOT NULL,
  label VARCHAR(255) NOT NULL,
  price_delta NUMERIC(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, modifier_group_id, label),
  CONSTRAINT fk_v0_menu_modifier_options_group
    FOREIGN KEY (tenant_id, modifier_group_id)
    REFERENCES v0_menu_modifier_groups(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_v0_menu_modifier_options_group
  ON v0_menu_modifier_options(tenant_id, modifier_group_id, status);

CREATE TABLE IF NOT EXISTS v0_menu_item_modifier_group_links (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL,
  modifier_group_id UUID NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, menu_item_id, modifier_group_id),
  CONSTRAINT fk_v0_menu_item_group_links_item
    FOREIGN KEY (tenant_id, menu_item_id)
    REFERENCES v0_menu_items(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v0_menu_item_group_links_group
    FOREIGN KEY (tenant_id, modifier_group_id)
    REFERENCES v0_menu_modifier_groups(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_v0_menu_item_group_links_group
  ON v0_menu_item_modifier_group_links(tenant_id, modifier_group_id);

CREATE TABLE IF NOT EXISTS v0_menu_item_base_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL,
  stock_item_id UUID NOT NULL,
  quantity_in_base_unit NUMERIC(12,4) NOT NULL CHECK (quantity_in_base_unit > 0),
  tracking_mode VARCHAR(20) NOT NULL
    CHECK (tracking_mode IN ('TRACKED', 'NOT_TRACKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, menu_item_id, stock_item_id),
  CONSTRAINT fk_v0_menu_base_components_item
    FOREIGN KEY (tenant_id, menu_item_id)
    REFERENCES v0_menu_items(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_v0_menu_base_components_item
  ON v0_menu_item_base_components(tenant_id, menu_item_id);

CREATE TABLE IF NOT EXISTS v0_menu_modifier_option_component_deltas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  modifier_option_id UUID NOT NULL,
  stock_item_id UUID NOT NULL,
  quantity_delta_in_base_unit NUMERIC(12,4) NOT NULL CHECK (quantity_delta_in_base_unit <> 0),
  tracking_mode VARCHAR(20) NOT NULL
    CHECK (tracking_mode IN ('TRACKED', 'NOT_TRACKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, modifier_option_id, stock_item_id),
  CONSTRAINT fk_v0_menu_option_deltas_option
    FOREIGN KEY (tenant_id, modifier_option_id)
    REFERENCES v0_menu_modifier_options(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_v0_menu_option_deltas_option
  ON v0_menu_modifier_option_component_deltas(tenant_id, modifier_option_id);
