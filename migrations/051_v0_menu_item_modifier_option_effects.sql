CREATE TABLE IF NOT EXISTS v0_menu_item_modifier_option_effects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL,
  modifier_option_id UUID NOT NULL,
  price_delta NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, menu_item_id, modifier_option_id),
  CONSTRAINT fk_v0_menu_item_option_effects_item
    FOREIGN KEY (tenant_id, menu_item_id)
    REFERENCES v0_menu_items(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v0_menu_item_option_effects_option
    FOREIGN KEY (tenant_id, modifier_option_id)
    REFERENCES v0_menu_modifier_options(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_v0_menu_item_option_effects_item
  ON v0_menu_item_modifier_option_effects(tenant_id, menu_item_id);

CREATE INDEX IF NOT EXISTS idx_v0_menu_item_option_effects_option
  ON v0_menu_item_modifier_option_effects(tenant_id, modifier_option_id);

CREATE TABLE IF NOT EXISTS v0_menu_item_modifier_option_component_deltas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  menu_item_modifier_option_effect_id UUID NOT NULL,
  stock_item_id UUID NOT NULL,
  quantity_delta_in_base_unit NUMERIC(12,4) NOT NULL CHECK (quantity_delta_in_base_unit <> 0),
  tracking_mode VARCHAR(20) NOT NULL
    CHECK (tracking_mode IN ('TRACKED', 'NOT_TRACKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, menu_item_modifier_option_effect_id, stock_item_id),
  CONSTRAINT fk_v0_menu_item_option_deltas_effect
    FOREIGN KEY (tenant_id, menu_item_modifier_option_effect_id)
    REFERENCES v0_menu_item_modifier_option_effects(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_v0_menu_item_option_deltas_effect
  ON v0_menu_item_modifier_option_component_deltas(
    tenant_id,
    menu_item_modifier_option_effect_id
  );

INSERT INTO v0_menu_item_modifier_option_effects (
  tenant_id,
  menu_item_id,
  modifier_option_id,
  price_delta
)
SELECT
  links.tenant_id,
  links.menu_item_id,
  options.id,
  options.price_delta
FROM v0_menu_item_modifier_group_links AS links
JOIN v0_menu_modifier_options AS options
  ON options.tenant_id = links.tenant_id
 AND options.modifier_group_id = links.modifier_group_id
ON CONFLICT (tenant_id, menu_item_id, modifier_option_id) DO NOTHING;

INSERT INTO v0_menu_item_modifier_option_component_deltas (
  tenant_id,
  menu_item_modifier_option_effect_id,
  stock_item_id,
  quantity_delta_in_base_unit,
  tracking_mode
)
SELECT
  effects.tenant_id,
  effects.id,
  deltas.stock_item_id,
  deltas.quantity_delta_in_base_unit,
  deltas.tracking_mode
FROM v0_menu_item_modifier_option_effects AS effects
JOIN v0_menu_modifier_option_component_deltas AS deltas
  ON deltas.tenant_id = effects.tenant_id
 AND deltas.modifier_option_id = effects.modifier_option_id
ON CONFLICT (tenant_id, menu_item_modifier_option_effect_id, stock_item_id) DO NOTHING;
