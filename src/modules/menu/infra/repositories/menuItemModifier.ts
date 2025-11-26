import type { Pool, PoolClient } from "pg";
import type { IMenuItemModifierRepository } from "../../app/ports.js";
import { ModifierGroup } from "../../domain/entities.js";

export class MenuItemModifierRepository implements IMenuItemModifierRepository {
  constructor(private pool: Pool) {}

  async attach(
    menuItemId: string,
    modifierGroupId: string,
    tenantId: string,
    isRequired: boolean,
    client?: PoolClient
  ): Promise<void> {
    const queryClient = client || this.pool;
    const sql = `
      INSERT INTO menu_item_modifier_groups (
        menu_item_id, modifier_group_id, tenant_id, is_required
      ) VALUES ($1, $2, $3, $4)
      ON CONFLICT (tenant_id, menu_item_id, modifier_group_id) DO UPDATE
      SET is_required = EXCLUDED.is_required
    `;
    await queryClient.query(sql, [
      menuItemId,
      modifierGroupId,
      tenantId,
      isRequired,
    ]);
  }

  async detach(
    menuItemId: string,
    modifierGroupId: string,
    tenantId: string,
    client?: PoolClient
  ): Promise<void> {
    const queryClient = client || this.pool;
    const sql = `
      DELETE FROM menu_item_modifier_groups
      WHERE menu_item_id = $1 AND modifier_group_id = $2 AND tenant_id = $3
    `;
    await queryClient.query(sql, [menuItemId, modifierGroupId, tenantId]);
  }

  async findByMenuItemId(
    menuItemId: string,
    tenantId: string,
    client?: PoolClient
  ): Promise<Array<{ group: ModifierGroup; isRequired: boolean }>> {
    const queryClient = client || this.pool;
    const sql = `
      SELECT mig.is_required, mg.*
      FROM menu_item_modifier_groups mig
      JOIN menu_modifier_groups mg ON mig.modifier_group_id = mg.id
      WHERE mig.menu_item_id = $1 AND mig.tenant_id = $2
    `;
    const result = await queryClient.query(sql, [menuItemId, tenantId]);
    return result.rows.map((row) => ({
      group: ModifierGroup.fromPersistence({
        id: row.id,
        tenantId: row.tenant_id,
        name: row.name,
        selectionType: row.selection_type,
        isActive: row.is_active,
        createdBy: row.created_by,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      }),
      isRequired: row.is_required,
    }));
  }

  async isAttached(
    menuItemId: string,
    modifierGroupId: string,
    tenantId: string,
    client?: PoolClient
  ): Promise<boolean> {
    const queryClient = client || this.pool;
    const sql = `
      SELECT COUNT(*) as count
      FROM menu_item_modifier_groups
      WHERE menu_item_id = $1 AND modifier_group_id = $2 AND tenant_id = $3
    `;
    const result = await queryClient.query(sql, [
      menuItemId,
      modifierGroupId,
      tenantId,
    ]);
    return parseInt(result.rows[0].count, 10) > 0;
  }

  async hasAnyForGroup(
    modifierGroupId: string,
    tenantId: string,
    client?: PoolClient
  ): Promise<boolean> {
    const queryClient = client || this.pool;
    const sql = `
      SELECT COUNT(*) as count
      FROM menu_item_modifier_groups
      WHERE modifier_group_id = $1 AND tenant_id = $2
    `;
    const result = await queryClient.query(sql, [modifierGroupId, tenantId]);
    return parseInt(result.rows[0].count, 10) > 0;
  }

  async countTotalOptionsForMenuItem(
    menuItemId: string,
    tenantId: string,
    client?: PoolClient
  ): Promise<number> {
    const queryClient = client || this.pool;
    const sql = `
      SELECT COUNT(mo.id) as count
      FROM menu_item_modifier_groups mig
      JOIN menu_modifier_options mo ON mig.modifier_group_id = mo.modifier_group_id
      WHERE mig.menu_item_id = $1 AND mig.tenant_id = $2 AND mo.is_active = true
    `;
    const result = await queryClient.query(sql, [menuItemId, tenantId]);
    return parseInt(result.rows[0].count, 10);
  }
}
