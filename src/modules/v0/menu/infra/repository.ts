import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type MenuActiveStatus = "ACTIVE" | "ARCHIVED";
export type MenuSelectionMode = "SINGLE" | "MULTI";
export type MenuTrackingMode = "TRACKED" | "NOT_TRACKED";

export type MenuCategoryRow = {
  id: string;
  tenant_id: string;
  name: string;
  status: MenuActiveStatus;
  created_at: Date;
  updated_at: Date;
};

export type MenuItemRow = {
  id: string;
  tenant_id: string;
  name: string;
  base_price: number;
  category_id: string | null;
  status: MenuActiveStatus;
  image_url: string | null;
  created_at: Date;
  updated_at: Date;
};

export type MenuModifierGroupRow = {
  id: string;
  tenant_id: string;
  name: string;
  selection_mode: MenuSelectionMode;
  min_selections: number;
  max_selections: number;
  is_required: boolean;
  status: MenuActiveStatus;
  created_at: Date;
  updated_at: Date;
};

export type MenuModifierOptionRow = {
  id: string;
  tenant_id: string;
  modifier_group_id: string;
  label: string;
  price_delta: number;
  status: MenuActiveStatus;
  created_at: Date;
  updated_at: Date;
};

export type MenuComponentRow = {
  id: string;
  tenant_id: string;
  stock_item_id: string;
  tracking_mode: MenuTrackingMode;
  created_at: Date;
  updated_at: Date;
};

export type MenuItemBaseComponentRow = MenuComponentRow & {
  menu_item_id: string;
  quantity_in_base_unit: number;
};

export type MenuModifierOptionDeltaRow = MenuComponentRow & {
  modifier_option_id: string;
  quantity_delta_in_base_unit: number;
};

export class V0MenuRepository {
  constructor(private readonly db: Queryable) {}

  async createCategory(input: {
    tenantId: string;
    name: string;
  }): Promise<MenuCategoryRow> {
    const result = await this.db.query<MenuCategoryRow>(
      `INSERT INTO v0_menu_categories (tenant_id, name)
       VALUES ($1, $2)
       RETURNING *`,
      [input.tenantId, input.name]
    );
    return result.rows[0];
  }

  async listCategories(input: {
    tenantId: string;
    status?: MenuActiveStatus | null;
  }): Promise<MenuCategoryRow[]> {
    const result = await this.db.query<MenuCategoryRow>(
      `SELECT *
       FROM v0_menu_categories
       WHERE tenant_id = $1
         AND ($2::VARCHAR IS NULL OR status = $2)
       ORDER BY name ASC, created_at ASC`,
      [input.tenantId, input.status ?? null]
    );
    return result.rows;
  }

  async getCategoryById(input: {
    tenantId: string;
    categoryId: string;
  }): Promise<MenuCategoryRow | null> {
    const result = await this.db.query<MenuCategoryRow>(
      `SELECT *
       FROM v0_menu_categories
       WHERE tenant_id = $1
         AND id = $2
       LIMIT 1`,
      [input.tenantId, input.categoryId]
    );
    return result.rows[0] ?? null;
  }

  async updateCategoryName(input: {
    tenantId: string;
    categoryId: string;
    name: string;
  }): Promise<MenuCategoryRow | null> {
    const result = await this.db.query<MenuCategoryRow>(
      `UPDATE v0_menu_categories
       SET name = $3,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND id = $2
       RETURNING *`,
      [input.tenantId, input.categoryId, input.name]
    );
    return result.rows[0] ?? null;
  }

  async archiveCategory(input: {
    tenantId: string;
    categoryId: string;
  }): Promise<MenuCategoryRow | null> {
    const result = await this.db.query<MenuCategoryRow>(
      `UPDATE v0_menu_categories
       SET status = 'ARCHIVED',
           updated_at = NOW()
       WHERE tenant_id = $1
         AND id = $2
       RETURNING *`,
      [input.tenantId, input.categoryId]
    );
    return result.rows[0] ?? null;
  }

  async clearCategoryFromMenuItems(input: {
    tenantId: string;
    categoryId: string;
  }): Promise<void> {
    await this.db.query(
      `UPDATE v0_menu_items
       SET category_id = NULL,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND category_id = $2`,
      [input.tenantId, input.categoryId]
    );
  }

  async createMenuItem(input: {
    tenantId: string;
    name: string;
    basePrice: number;
    categoryId?: string | null;
    imageUrl?: string | null;
  }): Promise<MenuItemRow> {
    const result = await this.db.query<MenuItemRow>(
      `INSERT INTO v0_menu_items (
         tenant_id,
         name,
         base_price,
         category_id,
         image_url
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING
         id,
         tenant_id,
         name,
         base_price::FLOAT8 AS base_price,
         category_id,
         status,
         image_url,
         created_at,
         updated_at`,
      [
        input.tenantId,
        input.name,
        input.basePrice,
        input.categoryId ?? null,
        input.imageUrl ?? null,
      ]
    );
    return result.rows[0];
  }

  async getMenuItemById(input: {
    tenantId: string;
    menuItemId: string;
  }): Promise<MenuItemRow | null> {
    const result = await this.db.query<MenuItemRow>(
      `SELECT
         id,
         tenant_id,
         name,
         base_price::FLOAT8 AS base_price,
         category_id,
         status,
         image_url,
         created_at,
         updated_at
       FROM v0_menu_items
       WHERE tenant_id = $1
         AND id = $2`,
      [input.tenantId, input.menuItemId]
    );
    return result.rows[0] ?? null;
  }

  async updateMenuItem(input: {
    tenantId: string;
    menuItemId: string;
    name: string;
    basePrice: number;
    categoryId: string | null;
    imageUrl: string | null;
  }): Promise<MenuItemRow | null> {
    const result = await this.db.query<MenuItemRow>(
      `UPDATE v0_menu_items
       SET name = $3,
           base_price = $4,
           category_id = $5,
           image_url = $6,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND id = $2
       RETURNING
         id,
         tenant_id,
         name,
         base_price::FLOAT8 AS base_price,
         category_id,
         status,
         image_url,
         created_at,
         updated_at`,
      [
        input.tenantId,
        input.menuItemId,
        input.name,
        input.basePrice,
        input.categoryId,
        input.imageUrl,
      ]
    );
    return result.rows[0] ?? null;
  }

  async updateMenuItemStatus(input: {
    tenantId: string;
    menuItemId: string;
    status: MenuActiveStatus;
  }): Promise<MenuItemRow | null> {
    const result = await this.db.query<MenuItemRow>(
      `UPDATE v0_menu_items
       SET status = $3,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND id = $2
       RETURNING
         id,
         tenant_id,
         name,
         base_price::FLOAT8 AS base_price,
         category_id,
         status,
         image_url,
         created_at,
         updated_at`,
      [input.tenantId, input.menuItemId, input.status]
    );
    return result.rows[0] ?? null;
  }

  async getMenuItemVisibleInBranch(input: {
    tenantId: string;
    branchId: string;
    menuItemId: string;
  }): Promise<MenuItemRow | null> {
    const result = await this.db.query<MenuItemRow>(
      `SELECT
         i.id,
         i.tenant_id,
         i.name,
         i.base_price::FLOAT8 AS base_price,
         i.category_id,
         i.status,
         i.image_url,
         i.created_at,
         i.updated_at
       FROM v0_menu_items i
       INNER JOIN v0_menu_item_branch_visibility v
         ON v.tenant_id = i.tenant_id
        AND v.menu_item_id = i.id
       WHERE i.tenant_id = $1
         AND v.branch_id = $2
         AND i.id = $3
       LIMIT 1`,
      [input.tenantId, input.branchId, input.menuItemId]
    );
    return result.rows[0] ?? null;
  }

  async setMenuItemVisibility(input: {
    tenantId: string;
    menuItemId: string;
    branchIds: readonly string[];
  }): Promise<void> {
    await this.db.query(
      `DELETE FROM v0_menu_item_branch_visibility
       WHERE tenant_id = $1
         AND menu_item_id = $2`,
      [input.tenantId, input.menuItemId]
    );

    if (input.branchIds.length === 0) {
      return;
    }

    await this.db.query(
      `INSERT INTO v0_menu_item_branch_visibility (
         tenant_id,
         menu_item_id,
         branch_id
       )
       SELECT
         $1,
         $2,
         b.id
       FROM branches b
       WHERE b.tenant_id = $1
         AND b.id = ANY($3::UUID[])
       ON CONFLICT (tenant_id, menu_item_id, branch_id)
       DO NOTHING`,
      [input.tenantId, input.menuItemId, input.branchIds]
    );
  }

  async listVisibleMenuItemsByBranch(input: {
    tenantId: string;
    branchId: string;
    status?: MenuActiveStatus | null;
  }): Promise<MenuItemRow[]> {
    const result = await this.db.query<MenuItemRow>(
      `SELECT
         i.id,
         i.tenant_id,
         i.name,
         i.base_price::FLOAT8 AS base_price,
         i.category_id,
         i.status,
         i.image_url,
         i.created_at,
         i.updated_at
       FROM v0_menu_items i
       INNER JOIN v0_menu_item_branch_visibility v
         ON v.tenant_id = i.tenant_id
        AND v.menu_item_id = i.id
       WHERE i.tenant_id = $1
         AND v.branch_id = $2
         AND ($3::VARCHAR IS NULL OR i.status = $3)
       ORDER BY i.name ASC, i.created_at ASC`,
      [input.tenantId, input.branchId, input.status ?? null]
    );
    return result.rows;
  }

  async listMenuItemsByTenant(input: {
    tenantId: string;
    status?: MenuActiveStatus | null;
  }): Promise<MenuItemRow[]> {
    const result = await this.db.query<MenuItemRow>(
      `SELECT
         id,
         tenant_id,
         name,
         base_price::FLOAT8 AS base_price,
         category_id,
         status,
         image_url,
         created_at,
         updated_at
       FROM v0_menu_items
       WHERE tenant_id = $1
         AND ($2::VARCHAR IS NULL OR status = $2)
       ORDER BY name ASC, created_at ASC`,
      [input.tenantId, input.status ?? null]
    );
    return result.rows;
  }

  async listVisibleBranchIdsForMenuItem(input: {
    tenantId: string;
    menuItemId: string;
  }): Promise<string[]> {
    const result = await this.db.query<{ branch_id: string }>(
      `SELECT branch_id
       FROM v0_menu_item_branch_visibility
       WHERE tenant_id = $1
         AND menu_item_id = $2
       ORDER BY branch_id ASC`,
      [input.tenantId, input.menuItemId]
    );
    return result.rows.map((row) => row.branch_id);
  }

  async createModifierGroup(input: {
    tenantId: string;
    name: string;
    selectionMode: MenuSelectionMode;
    minSelections: number;
    maxSelections: number;
    isRequired: boolean;
  }): Promise<MenuModifierGroupRow> {
    const result = await this.db.query<MenuModifierGroupRow>(
      `INSERT INTO v0_menu_modifier_groups (
         tenant_id,
         name,
         selection_mode,
         min_selections,
         max_selections,
         is_required
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.tenantId,
        input.name,
        input.selectionMode,
        input.minSelections,
        input.maxSelections,
        input.isRequired,
      ]
    );
    return result.rows[0];
  }

  async listModifierGroups(input: {
    tenantId: string;
    status?: MenuActiveStatus | null;
  }): Promise<MenuModifierGroupRow[]> {
    const result = await this.db.query<MenuModifierGroupRow>(
      `SELECT *
       FROM v0_menu_modifier_groups
       WHERE tenant_id = $1
         AND ($2::VARCHAR IS NULL OR status = $2)
       ORDER BY name ASC, created_at ASC`,
      [input.tenantId, input.status ?? null]
    );
    return result.rows;
  }

  async getModifierGroupById(input: {
    tenantId: string;
    groupId: string;
  }): Promise<MenuModifierGroupRow | null> {
    const result = await this.db.query<MenuModifierGroupRow>(
      `SELECT *
       FROM v0_menu_modifier_groups
       WHERE tenant_id = $1
         AND id = $2
       LIMIT 1`,
      [input.tenantId, input.groupId]
    );
    return result.rows[0] ?? null;
  }

  async updateModifierGroup(input: {
    tenantId: string;
    groupId: string;
    name: string;
    selectionMode: MenuSelectionMode;
    minSelections: number;
    maxSelections: number;
    isRequired: boolean;
  }): Promise<MenuModifierGroupRow | null> {
    const result = await this.db.query<MenuModifierGroupRow>(
      `UPDATE v0_menu_modifier_groups
       SET name = $3,
           selection_mode = $4,
           min_selections = $5,
           max_selections = $6,
           is_required = $7,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND id = $2
       RETURNING *`,
      [
        input.tenantId,
        input.groupId,
        input.name,
        input.selectionMode,
        input.minSelections,
        input.maxSelections,
        input.isRequired,
      ]
    );
    return result.rows[0] ?? null;
  }

  async updateModifierGroupStatus(input: {
    tenantId: string;
    groupId: string;
    status: MenuActiveStatus;
  }): Promise<MenuModifierGroupRow | null> {
    const result = await this.db.query<MenuModifierGroupRow>(
      `UPDATE v0_menu_modifier_groups
       SET status = $3,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND id = $2
       RETURNING *`,
      [input.tenantId, input.groupId, input.status]
    );
    return result.rows[0] ?? null;
  }

  async createModifierOption(input: {
    tenantId: string;
    groupId: string;
    label: string;
    priceDelta: number;
  }): Promise<MenuModifierOptionRow> {
    const result = await this.db.query<MenuModifierOptionRow>(
      `INSERT INTO v0_menu_modifier_options (
         tenant_id,
         modifier_group_id,
         label,
         price_delta
       )
       VALUES ($1, $2, $3, $4)
       RETURNING
         id,
         tenant_id,
         modifier_group_id,
         label,
         price_delta::FLOAT8 AS price_delta,
         status,
         created_at,
         updated_at`,
      [input.tenantId, input.groupId, input.label, input.priceDelta]
    );
    return result.rows[0];
  }

  async getModifierOptionById(input: {
    tenantId: string;
    optionId: string;
  }): Promise<MenuModifierOptionRow | null> {
    const result = await this.db.query<MenuModifierOptionRow>(
      `SELECT
         id,
         tenant_id,
         modifier_group_id,
         label,
         price_delta::FLOAT8 AS price_delta,
         status,
         created_at,
         updated_at
       FROM v0_menu_modifier_options
       WHERE tenant_id = $1
         AND id = $2
       LIMIT 1`,
      [input.tenantId, input.optionId]
    );
    return result.rows[0] ?? null;
  }

  async updateModifierOption(input: {
    tenantId: string;
    optionId: string;
    label: string;
    priceDelta: number;
  }): Promise<MenuModifierOptionRow | null> {
    const result = await this.db.query<MenuModifierOptionRow>(
      `UPDATE v0_menu_modifier_options
       SET label = $3,
           price_delta = $4,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND id = $2
       RETURNING
         id,
         tenant_id,
         modifier_group_id,
         label,
         price_delta::FLOAT8 AS price_delta,
         status,
         created_at,
         updated_at`,
      [input.tenantId, input.optionId, input.label, input.priceDelta]
    );
    return result.rows[0] ?? null;
  }

  async updateModifierOptionStatus(input: {
    tenantId: string;
    optionId: string;
    status: MenuActiveStatus;
  }): Promise<MenuModifierOptionRow | null> {
    const result = await this.db.query<MenuModifierOptionRow>(
      `UPDATE v0_menu_modifier_options
       SET status = $3,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND id = $2
       RETURNING
         id,
         tenant_id,
         modifier_group_id,
         label,
         price_delta::FLOAT8 AS price_delta,
         status,
         created_at,
         updated_at`,
      [input.tenantId, input.optionId, input.status]
    );
    return result.rows[0] ?? null;
  }

  async listModifierOptionsByGroupIds(input: {
    tenantId: string;
    groupIds: readonly string[];
  }): Promise<MenuModifierOptionRow[]> {
    if (input.groupIds.length === 0) {
      return [];
    }
    const result = await this.db.query<MenuModifierOptionRow>(
      `SELECT
         id,
         tenant_id,
         modifier_group_id,
         label,
         price_delta::FLOAT8 AS price_delta,
         status,
         created_at,
         updated_at
       FROM v0_menu_modifier_options
       WHERE tenant_id = $1
         AND modifier_group_id = ANY($2::UUID[])
       ORDER BY modifier_group_id ASC, label ASC`,
      [input.tenantId, input.groupIds]
    );
    return result.rows;
  }

  async setModifierGroupsForMenuItem(input: {
    tenantId: string;
    menuItemId: string;
    groupIds: readonly string[];
  }): Promise<void> {
    await this.db.query(
      `DELETE FROM v0_menu_item_modifier_group_links
       WHERE tenant_id = $1
         AND menu_item_id = $2`,
      [input.tenantId, input.menuItemId]
    );

    if (input.groupIds.length === 0) {
      return;
    }

    await this.db.query(
      `INSERT INTO v0_menu_item_modifier_group_links (
         tenant_id,
         menu_item_id,
         modifier_group_id,
         display_order
       )
       SELECT
         $1,
         $2,
         x.group_id,
         x.display_order
       FROM UNNEST($3::UUID[]) WITH ORDINALITY AS x(group_id, display_order)
       ON CONFLICT (tenant_id, menu_item_id, modifier_group_id)
       DO UPDATE
       SET display_order = EXCLUDED.display_order`,
      [input.tenantId, input.menuItemId, input.groupIds]
    );
  }

  async listModifierGroupIdsForMenuItem(input: {
    tenantId: string;
    menuItemId: string;
  }): Promise<string[]> {
    const result = await this.db.query<{ modifier_group_id: string }>(
      `SELECT modifier_group_id
       FROM v0_menu_item_modifier_group_links
       WHERE tenant_id = $1
         AND menu_item_id = $2
       ORDER BY display_order ASC, modifier_group_id ASC`,
      [input.tenantId, input.menuItemId]
    );
    return result.rows.map((row) => row.modifier_group_id);
  }

  async setBaseComponentsForMenuItem(input: {
    tenantId: string;
    menuItemId: string;
    components: ReadonlyArray<{
      stockItemId: string;
      quantityInBaseUnit: number;
      trackingMode: MenuTrackingMode;
    }>;
  }): Promise<void> {
    await this.db.query(
      `DELETE FROM v0_menu_item_base_components
       WHERE tenant_id = $1
         AND menu_item_id = $2`,
      [input.tenantId, input.menuItemId]
    );

    if (input.components.length === 0) {
      return;
    }

    for (const component of input.components) {
      await this.db.query(
        `INSERT INTO v0_menu_item_base_components (
           tenant_id,
           menu_item_id,
           stock_item_id,
           quantity_in_base_unit,
           tracking_mode
         )
         VALUES ($1, $2, $3, $4, $5)`,
        [
          input.tenantId,
          input.menuItemId,
          component.stockItemId,
          component.quantityInBaseUnit,
          component.trackingMode,
        ]
      );
    }
  }

  async listBaseComponentsForMenuItem(input: {
    tenantId: string;
    menuItemId: string;
  }): Promise<MenuItemBaseComponentRow[]> {
    const result = await this.db.query<MenuItemBaseComponentRow>(
      `SELECT
         id,
         tenant_id,
         menu_item_id,
         stock_item_id,
         quantity_in_base_unit::FLOAT8 AS quantity_in_base_unit,
         tracking_mode,
         created_at,
         updated_at
       FROM v0_menu_item_base_components
       WHERE tenant_id = $1
         AND menu_item_id = $2
       ORDER BY created_at ASC`,
      [input.tenantId, input.menuItemId]
    );
    return result.rows;
  }

  async setComponentDeltasForModifierOption(input: {
    tenantId: string;
    modifierOptionId: string;
    deltas: ReadonlyArray<{
      stockItemId: string;
      quantityDeltaInBaseUnit: number;
      trackingMode: MenuTrackingMode;
    }>;
  }): Promise<void> {
    await this.db.query(
      `DELETE FROM v0_menu_modifier_option_component_deltas
       WHERE tenant_id = $1
         AND modifier_option_id = $2`,
      [input.tenantId, input.modifierOptionId]
    );

    if (input.deltas.length === 0) {
      return;
    }

    for (const delta of input.deltas) {
      await this.db.query(
        `INSERT INTO v0_menu_modifier_option_component_deltas (
           tenant_id,
           modifier_option_id,
           stock_item_id,
           quantity_delta_in_base_unit,
           tracking_mode
         )
         VALUES ($1, $2, $3, $4, $5)`,
        [
          input.tenantId,
          input.modifierOptionId,
          delta.stockItemId,
          delta.quantityDeltaInBaseUnit,
          delta.trackingMode,
        ]
      );
    }
  }

  async listComponentDeltasByModifierOptionIds(input: {
    tenantId: string;
    modifierOptionIds: readonly string[];
  }): Promise<MenuModifierOptionDeltaRow[]> {
    if (input.modifierOptionIds.length === 0) {
      return [];
    }
    const result = await this.db.query<MenuModifierOptionDeltaRow>(
      `SELECT
         id,
         tenant_id,
         modifier_option_id,
         stock_item_id,
         quantity_delta_in_base_unit::FLOAT8 AS quantity_delta_in_base_unit,
         tracking_mode,
         created_at,
         updated_at
       FROM v0_menu_modifier_option_component_deltas
       WHERE tenant_id = $1
         AND modifier_option_id = ANY($2::UUID[])
       ORDER BY modifier_option_id ASC, created_at ASC`,
      [input.tenantId, input.modifierOptionIds]
    );
    return result.rows;
  }

  async isBranchEntitlementEnabled(input: {
    tenantId: string;
    branchId: string;
    entitlementKey: string;
  }): Promise<boolean> {
    const result = await this.db.query<{ enforcement: string }>(
      `SELECT enforcement
       FROM v0_branch_entitlements
       WHERE tenant_id = $1
         AND branch_id = $2
         AND entitlement_key = $3
       LIMIT 1`,
      [input.tenantId, input.branchId, input.entitlementKey]
    );
    const enforcement = String(result.rows[0]?.enforcement ?? "").toUpperCase();
    return enforcement === "ENABLED";
  }
}
