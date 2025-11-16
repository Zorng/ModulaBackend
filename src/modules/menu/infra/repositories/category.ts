
import type { Pool, PoolClient } from "pg";
import type { ICategoryRepository } from "../../app/ports.js";
import { Category } from "../../domain/entities.js";



export class CategoryRepository implements ICategoryRepository {
  constructor(private pool: Pool) {}

  /**
   * Save a category (insert if new, update if exists)
   * Uses UPSERT pattern with ON CONFLICT
   */
  async save(category: Category): Promise<void> {
    const sql = `
      INSERT INTO menu_categories (
        id, 
        tenant_id, 
        name,
        description,
        display_order, 
        is_active,
        created_by,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) 
      DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        display_order = EXCLUDED.display_order,
        is_active = EXCLUDED.is_active,
        updated_at = EXCLUDED.updated_at
    `;

    await this.pool.query(sql, [
      category.id,
      category.tenantId,
      category.name,
      category.description || null,
      category.displayOrder,
      category.isActive,
      category.createdBy,
      category.createdAt,
      category.updatedAt,
    ]);
  }

  /**
   * Find category by ID
   * Returns null if not found (not an error)
   */
  async findById(id: string, tenantId: string): Promise<Category | null> {
    const sql = `
      SELECT 
        id,
        tenant_id,
        name,
        description,
        display_order,
        is_active,
        created_by,
        created_at,
        updated_at
      FROM menu_categories
      WHERE id = $1 AND tenant_id = $2
    `;

    const result = await this.pool.query(sql, [id, tenantId]);

    if (result.rows.length === 0) {
      return null;
    }

    // Map database row to entity
    return this.mapRowToEntity(result.rows[0]);
  }

  /**
   * Find all categories for a tenant
   * Ordered by display_order ASC for proper UI sorting
   */
  async findByTenantId(tenantId: string): Promise<Category[]> {
    const sql = `
      SELECT 
        id,
        tenant_id,
        name,
        description,
        display_order,
        is_active,
        created_by,
        created_at,
        updated_at
      FROM menu_categories
      WHERE tenant_id = $1
      ORDER BY display_order ASC
    `;

    const result = await this.pool.query(sql, [tenantId]);

    // Map all rows to entities
    return result.rows.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Count active categories for quota enforcement
   * Only counts is_active = true
   */
  async countByTenantId(tenantId: string): Promise<number> {
    const sql = `
      SELECT COUNT(*) as count
      FROM menu_categories
      WHERE tenant_id = $1 AND is_active = true
    `;

    const result = await this.pool.query(sql, [tenantId]);
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Soft delete a category
   * Just sets is_active = false, doesn't remove from database
   */
  async delete(id: string, tenantId: string): Promise<void> {
    const sql = `
      UPDATE menu_categories
      SET 
        is_active = false,
        updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
    `;

    await this.pool.query(sql, [id, tenantId]);
  }

  /**
   * Check if category name exists (for uniqueness validation)
   * Can exclude a specific ID (useful for updates)
   */
  async existsByName(
    name: string,
    tenantId: string,
    excludeId?: string
  ): Promise<boolean> {
    let sql = `
      SELECT COUNT(*) as count
      FROM menu_categories
      WHERE tenant_id = $1 
        AND LOWER(name) = LOWER($2)
        AND is_active = true
    `;

    const params: any[] = [tenantId, name];

    // Exclude specific ID if provided (for update operations)
    if (excludeId) {
      sql += ` AND id != $3`;
      params.push(excludeId);
    }

    const result = await this.pool.query(sql, params);
    return parseInt(result.rows[0].count, 10) > 0;
  }

  /**
   * PRIVATE HELPER: Map database row to Category entity
   *
   * This is a key pattern - always reconstruct entities from DB data.
   * We check the result because DB data should always be valid.
   */
  private mapRowToEntity(row: any): Category {
    // Use fromPersistence to reconstruct from DB (preserves timestamps, no validation)
    return Category.fromPersistence({
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      description: row.description,
      displayOrder: row.display_order,
      isActive: row.is_active,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}
