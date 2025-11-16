import type { Pool, PoolClient } from "pg";
import type { IModifierRepository } from "../../app/ports.js";
import { ModifierGroup, ModifierOption } from "../../domain/entities.js";

export class ModifierRepository implements IModifierRepository {
  constructor(private pool: Pool) {}

  async saveGroup(group: ModifierGroup): Promise<void> {
    const sql = `
            INSERT INTO menu_modifier_groups (
                id, 
                tenant_id, 
                name, 
                selection_type, 
                created_by, 
                created_at, 
                updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, NOW(), NOW()
            )
            ON CONFLICT (id) DO UPDATE
            SET
                name = EXCLUDED.name,
                selection_type = EXCLUDED.selection_type,
                updated_at = NOW()
        `;

    await this.pool.query(sql, [
      group.id,
      group.tenantId,
      group.name,
      group.selectionType,
      group.createdBy,
    ]);
  }

  async saveOption(option: ModifierOption): Promise<void> {
    const sql = `
            INSERT INTO menu_modifier_options (
                id, 
                modifier_group_id, 
                label, 
                price_adjustment_usd, 
                is_default, 
                is_active, 
                created_at, 
                updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, NOW(), NOW()
            )
            ON CONFLICT (id) DO UPDATE
            SET
                label = EXCLUDED.label,
                price_adjustment_usd = EXCLUDED.price_adjustment_usd,
                is_default = EXCLUDED.is_default,
                is_active = EXCLUDED.is_active,
                updated_at = NOW()
        `;

    await this.pool.query(sql, [
      option.id,
      option.modifierGroupId,
      option.label,
      option.priceAdjustmentUsd,
      option.isDefault,
      option.isActive,
    ]);
  }
  async findGroupById(
    id: string,
    tenantId: string
  ): Promise<ModifierGroup | null> {
    const sql = `
            SELECT *
            FROM menu_modifier_groups
            WHERE id = $1
                AND tenant_id = $2
            LIMIT 1;
        `;

    const result = await this.pool.query(sql, [id, tenantId]);

    if (result.rows.length === 0) return null;

    return this.mapRowToEntity(result.rows[0]);
  }

  async findOptionById(
    id: string,
    tenantId: string
  ): Promise<ModifierOption | null> {
    const sql = `
            SELECT mo.*
            FROM menu_modifier_options mo
            JOIN menu_modifier_groups mg ON mo.modifier_group_id = mg.id
            WHERE mo.id = $1
                AND mg.tenant_id = $2
            LIMIT 1
        `;

    const result = await this.pool.query(sql, [id, tenantId]);
    if (result.rows.length === 0) return null;
    return this.mapRowToOption(result.rows[0]);
  }

  async findOptionsByGroupId(
    groupId: string,
    tenantId: string
  ): Promise<ModifierOption[]> {
    const sql = `
            SELECT mo.*
            FROM menu_modifier_options mo
            JOIN menu_modifier_groups mg ON mo.modifier_group_id = mg.id
            WHERE mo.modifier_group_id = $1
                AND mg.tenant_id = $2
            ORDER BY mo.label ASC
        `;

    const result = await this.pool.query(sql, [groupId, tenantId]);
    return result.rows.map((row) => this.mapRowToOption(row));
  }

  async findGroupsByTenantId(tenantId: string): Promise<ModifierGroup[]> {
    const sql = `
            SELECT *
            FROM menu_modifier_groups
            WHERE tenant_id = $1
            ORDER BY name ASC
        `;

    const result = await this.pool.query(sql, [tenantId]);
    return result.rows.map((row) => this.mapRowToEntity(row));
  }

  async deleteGroup(id: string, tenantId: string): Promise<void> {
    const sql = `
            DELETE FROM menu_modifier_groups
            WHERE id = $1 AND tenant_id = $2
        `;

    await this.pool.query(sql, [id, tenantId]);
  }

  async deleteOption(id: string, tenantId: string): Promise<void> {
    const sql = `
            UPDATE menu_modifier_options mo
            SET 
                is_active = false,
                updated_at = NOW()
            FROM menu_modifier_groups mg
            WHERE mo.id = $1
                AND mo.modifier_group_id = mg.id
                AND mg.tenant_id = $2
        `;

    await this.pool.query(sql, [id, tenantId]);
  }

  private mapRowToEntity(row: any): ModifierGroup {
    return ModifierGroup.fromPersistence({
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      selectionType: row.selection_type,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }

  private mapRowToOption(row: any): ModifierOption {
    return ModifierOption.fromPersistence({
      id: row.id,
      modifierGroupId: row.modifier_group_id,
      label: row.label,
      priceAdjustmentUsd: row.price_adjustment_usd,
      isDefault: row.is_default,
      isActive: row.is_active,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}
