import type { Pool } from "pg";
import type { StorePolicyInventoryRepository as IStorePolicyInventoryRepository } from "../domain/repositories.js";
import { StorePolicyInventory } from "../domain/entities.js";

export class StorePolicyInventoryRepository
  implements IStorePolicyInventoryRepository
{
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async findByTenant(tenantId: string): Promise<StorePolicyInventory | null> {
    const res = await this.pool.query(
      "SELECT * FROM store_policy_inventory WHERE tenant_id = $1",
      [tenantId]
    );
    if (res.rows.length === 0) return null;
    return this.toEntity(res.rows[0]);
  }

  async save(
    policy: Omit<StorePolicyInventory, "updatedAt">
  ): Promise<StorePolicyInventory> {
    const res = await this.pool.query(
      `INSERT INTO store_policy_inventory (
        tenant_id,
        inventory_subtract_on_finalize,
        branch_overrides,
        exclude_menu_item_ids,
        updated_by
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (tenant_id)
      DO UPDATE SET
        inventory_subtract_on_finalize = EXCLUDED.inventory_subtract_on_finalize,
        branch_overrides = EXCLUDED.branch_overrides,
        exclude_menu_item_ids = EXCLUDED.exclude_menu_item_ids,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING *`,
      [
        policy.tenantId,
        policy.inventorySubtractOnFinalize,
        JSON.stringify(policy.branchOverrides),
        JSON.stringify(policy.excludeMenuItemIds),
        policy.updatedBy,
      ]
    );
    return this.toEntity(res.rows[0]);
  }

  async update(
    tenantId: string,
    updates: Partial<Omit<StorePolicyInventory, "tenantId" | "updatedAt">>
  ): Promise<StorePolicyInventory | null> {
    const fields = Object.keys(updates);
    if (fields.length === 0) return this.findByTenant(tenantId);

    const fieldMap: Record<string, string> = {
      inventorySubtractOnFinalize: "inventory_subtract_on_finalize",
      branchOverrides: "branch_overrides",
      excludeMenuItemIds: "exclude_menu_item_ids",
      updatedBy: "updated_by",
    };

    const setClauses: string[] = ["updated_at = NOW()"];
    const values: any[] = [];
    let paramIndex = 2;

    for (const field of fields) {
      const dbColumn = fieldMap[field];
      if (dbColumn) {
        setClauses.push(`${dbColumn} = $${paramIndex}`);
        let value = (updates as any)[field];

        // Stringify JSONB fields
        if (field === "branchOverrides" || field === "excludeMenuItemIds") {
          value = JSON.stringify(value);
        }

        values.push(value);
        paramIndex++;
      }
    }

    const query = `UPDATE store_policy_inventory 
                   SET ${setClauses.join(", ")} 
                   WHERE tenant_id = $1 
                   RETURNING *`;

    const res = await this.pool.query(query, [tenantId, ...values]);
    if (res.rows.length === 0) return null;
    return this.toEntity(res.rows[0]);
  }

  private toEntity(row: any): StorePolicyInventory {
    return {
      tenantId: row.tenant_id,
      inventorySubtractOnFinalize: row.inventory_subtract_on_finalize,
      branchOverrides:
        typeof row.branch_overrides === "string"
          ? JSON.parse(row.branch_overrides)
          : row.branch_overrides,
      excludeMenuItemIds:
        typeof row.exclude_menu_item_ids === "string"
          ? JSON.parse(row.exclude_menu_item_ids)
          : row.exclude_menu_item_ids,
      updatedBy: row.updated_by,
      updatedAt: new Date(row.updated_at),
    };
  }
}
