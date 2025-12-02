import type { Pool } from "pg";
import type { InventoryCategoryRepository as IInventoryCategoryRepository } from "../domain/repositories.js";
import { InventoryCategory } from "../domain/entities.js";

export class InventoryCategoryRepository
  implements IInventoryCategoryRepository
{
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async findById(id: string): Promise<InventoryCategory | null> {
    const res = await this.pool.query(
      "SELECT * FROM inventory_categories WHERE id = $1",
      [id]
    );
    if (res.rows.length === 0) return null;
    return this.toEntity(res.rows[0]);
  }

  async findByTenant(tenantId: string): Promise<InventoryCategory[]> {
    const res = await this.pool.query(
      `SELECT * FROM inventory_categories 
       WHERE tenant_id = $1 
       ORDER BY display_order ASC, name ASC`,
      [tenantId]
    );
    return res.rows.map(this.toEntity);
  }

  async findByTenantAndActive(
    tenantId: string,
    isActive?: boolean
  ): Promise<InventoryCategory[]> {
    let query = "SELECT * FROM inventory_categories WHERE tenant_id = $1";
    const params: any[] = [tenantId];

    if (typeof isActive === "boolean") {
      query += " AND is_active = $2";
      params.push(isActive);
    }

    query += " ORDER BY display_order ASC, name ASC";

    const res = await this.pool.query(query, params);
    return res.rows.map(this.toEntity);
  }

  async countItemsInCategory(categoryId: string): Promise<number> {
    const res = await this.pool.query(
      "SELECT COUNT(*) as count FROM stock_items WHERE category_id = $1",
      [categoryId]
    );
    return parseInt(res.rows[0].count, 10);
  }

  async save(
    category: Omit<InventoryCategory, "id" | "createdAt" | "updatedAt">
  ): Promise<InventoryCategory> {
    const res = await this.pool.query(
      `INSERT INTO inventory_categories (
        tenant_id,
        name,
        display_order,
        is_active,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [
        category.tenantId,
        category.name,
        category.displayOrder,
        category.isActive,
        category.createdBy,
      ]
    );
    return this.toEntity(res.rows[0]);
  }

  async update(
    id: string,
    updates: Partial<
      Omit<InventoryCategory, "id" | "tenantId" | "createdAt" | "updatedAt">
    >
  ): Promise<InventoryCategory | null> {
    const fields = Object.keys(updates);
    if (fields.length === 0) return this.findById(id);

    const fieldMap: Record<string, string> = {
      name: "name",
      displayOrder: "display_order",
      isActive: "is_active",
      createdBy: "created_by",
    };

    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 2;

    for (const field of fields) {
      const dbColumn = fieldMap[field];
      if (dbColumn) {
        setClauses.push(`${dbColumn} = $${paramIndex}`);
        values.push((updates as any)[field]);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) return this.findById(id);

    const query = `UPDATE inventory_categories 
                   SET ${setClauses.join(", ")} 
                   WHERE id = $1 
                   RETURNING *`;

    const res = await this.pool.query(query, [id, ...values]);
    if (res.rows.length === 0) return null;
    return this.toEntity(res.rows[0]);
  }

  async delete(id: string): Promise<void> {
    await this.pool.query("DELETE FROM inventory_categories WHERE id = $1", [
      id,
    ]);
  }

  private toEntity(row: any): InventoryCategory {
    return {
      id: row.id.toString(),
      tenantId: row.tenant_id,
      name: row.name,
      displayOrder: parseInt(row.display_order, 10),
      isActive: row.is_active,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
