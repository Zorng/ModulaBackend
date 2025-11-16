import type { Pool } from "pg";
import type { IMenuItemModifierRepository } from "../../app/ports.js";
import { ModifierGroup } from "../../domain/entities.js";

export class MenuItemModifierRepository implements IMenuItemModifierRepository {
  constructor(private pool: Pool) {}

  async attach(
    menuItemId: string,
    modifierGroupId: string,
    tenantId: string,
    isRequired: boolean
  ): Promise<void> {
    const sql = `
      INSERT INTO menu_item_modifier_groups (
        menu_item_id, modifier_group_id, tenant_id, is_required
      ) VALUES ($1, $2, $3, $4)
      ON CONFLICT (menu_item_id, modifier_group_id) DO UPDATE
      SET is_required = EXCLUDED.is_required
    `;
    await this.pool.query(sql, [
      menuItemId,
      modifierGroupId,
      tenantId,
      isRequired,
    ]);
  }

  async detach(
    menuItemId: string,
    modifierGroupId: string,
    tenantId: string
  ): Promise<void> {
    const sql = `
      DELETE FROM menu_item_modifier_groups
      WHERE menu_item_id = $1 AND modifier_group_id = $2 AND tenant_id = $3
    `;
    await this.pool.query(sql, [menuItemId, modifierGroupId, tenantId]);
  }

  async findByMenuItemId(
    menuItemId: string,
    tenantId: string
  ): Promise<Array<{ group: ModifierGroup; isRequired: boolean }>> {
    const sql = `
      SELECT mig.is_required, mg.*
      FROM menu_item_modifier_groups mig
      JOIN menu_modifier_groups mg ON mig.modifier_group_id = mg.id
      WHERE mig.menu_item_id = $1 AND mig.tenant_id = $2
    `;
    const result = await this.pool.query(sql, [menuItemId, tenantId]);
    return result.rows.map((row) => ({
      group: ModifierGroup.fromPersistence({
        id: row.id,
        tenantId: row.tenant_id,
        name: row.name,
        selectionType: row.selection_type,
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
    tenantId: string
  ): Promise<boolean> {
    const sql = `
      SELECT COUNT(*) as count
      FROM menu_item_modifier_groups
      WHERE menu_item_id = $1 AND modifier_group_id = $2 AND tenant_id = $3
    `;
    const result = await this.pool.query(sql, [
      menuItemId,
      modifierGroupId,
      tenantId,
    ]);
    return parseInt(result.rows[0].count, 10) > 0;
  }

}
