import type { Pool, PoolClient } from "pg";
import type { IMenuItemRepository } from "../../app/ports.js";
import { Category, MenuItem } from "../../domain/entities.js";

export class MenuItemRepository implements IMenuItemRepository {
  constructor(private pool: Pool) {}

  async save(item: MenuItem): Promise<void> {
    const sql = `
      INSERT INTO menu_items (
        id, 
        tenant_id, 
        category_id,
        name,
        description,
        price_usd,
        image_url, 
        is_active,
        created_by,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      ON CONFLICT (id) 
      DO UPDATE SET
        category_id = EXCLUDED.category_id,
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        price_usd = EXCLUDED.price_usd,
        image_url = EXCLUDED.image_url,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
    `;

    await this.pool.query(sql, [
      item.id,
      item.tenantId,
      item.categoryId,
      item.name,
      item.description,
      item.priceUsd,
      item.imageUrl,
      item.isActive,
      item.createdBy,
      item.createdAt,
      item.updatedAt,
    ]);
  }

  async findById(id: string, tenantId: string): Promise<MenuItem | null> {
    const sql = `
            SELECT 
                id,
                tenant_id,
                category_id,
                name,
                description,
                price_usd,
                image_url,
                is_active,
                created_by,
                created_at,
                updated_at
            FROM menu_items
            WHERE id = $1 AND tenant_id = $2
        `;
    const result = await this.pool.query(sql, [id, tenantId]);

    if (result.rows.length === 0) return null;

    return this.mapRowToEntity(result.rows[0]);
  }

  async findByCategoryId(
    categoryId: string,
    tenantId: string
  ): Promise<MenuItem[]> {
    const sql = `
            SELECT 
                id,
                tenant_id,
                category_id,
                name,
                description,
                price_usd,
                image_url,
                is_active,
                created_by,
                created_at,
                updated_at
            FROM menu_items
            WHERE category_id = $1 AND tenant_id = $2
            ORDER BY name ASC
        `;

    const result = await this.pool.query(sql, [categoryId, tenantId]);
    return result.rows.map((row) => this.mapRowToEntity(row));
  }

  async findByTenantId(tenantId: string): Promise<MenuItem[]> {
    const sql = `
            SELECT 
                id,
                tenant_id,
                category_id,
                name,
                description,
                price_usd,
                image_url,
                is_active,
                created_by,
                created_at,
                updated_at
            FROM menu_items
            WHERE tenant_id = $1
            ORDER BY name ASC
        `;

    const result = await this.pool.query(sql, [tenantId]);

    return result.rows.map((row) => this.mapRowToEntity(row));
  }

  async countByTenantId(tenantId: string): Promise<number> {
    const sql = `
            SELECT COUNT(*) as count
            FROM menu_items
            WHERE tenant_id = $1 AND is_active = true
        `;

    const result = await this.pool.query(sql, [tenantId]);
    return parseInt(result.rows[0].count, 10);
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const sql = `
            UPDATE menu_items
            SET 
                is_active = false,
                updated_at = NOW()
            WHERE id = $1 AND tenant_id = $2
        `;

    await this.pool.query(sql, [id, tenantId]);
  }

  async existsByNameInCategory(
    name: string,
    categoryId: string,
    tenantId: string,
    excludeId?: string
  ): Promise<boolean> {
    let sql = `
            SELECT COUNT(*) as count
            FROM menu_items
            WHERE tenant_id = $1 
                AND category_id = $2
                AND LOWER(name) = LOWER($3)
                AND is_active = true
        `;

    const params: any[] = [tenantId, categoryId, name];

    if (excludeId) {
      sql += ` AND id != $4`;
      params.push(excludeId);
    }

    const result = await this.pool.query(sql, params);
    return parseInt(result.rows[0].count, 10) > 0;
  }

  private mapRowToEntity(row: any): MenuItem {
    // Use fromPersistence to reconstruct from DB (preserves timestamps, no validation)
    return MenuItem.fromPersistence({
      id: row.id,
      tenantId: row.tenant_id,
      categoryId: row.category_id,
      name: row.name,
      description: row.description,
      priceUsd: parseFloat(row.price_usd),
      imageUrl: row.image_url,
      isActive: row.is_active,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}
