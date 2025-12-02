import type { Pool } from "pg";
import type { StockItemRepository as IStockItemRepository } from "../domain/repositories.js";
import { StockItem } from "../domain/entities.js";

export class StockItemRepository implements IStockItemRepository {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async findById(id: string): Promise<StockItem | null> {
    const res = await this.pool.query(
      "SELECT * FROM stock_items WHERE id = $1",
      [id]
    );
    if (res.rows.length === 0) return null;
    return this.toEntity(res.rows[0]);
  }

  async findByTenant(tenantId: string): Promise<StockItem[]> {
    const res = await this.pool.query(
      "SELECT * FROM stock_items WHERE tenant_id = $1 ORDER BY name ASC",
      [tenantId]
    );
    return res.rows.map(this.toEntity);
  }

  async findByTenantAndActive(
    tenantId: string,
    isActive?: boolean
  ): Promise<StockItem[]> {
    let query = "SELECT * FROM stock_items WHERE tenant_id = $1";
    const params: any[] = [tenantId];

    if (typeof isActive === "boolean") {
      query += " AND is_active = $2";
      params.push(isActive);
    }

    query += " ORDER BY name ASC";

    const res = await this.pool.query(query, params);
    return res.rows.map(this.toEntity);
  }

  async save(
    item: Omit<StockItem, "id" | "createdAt" | "updatedAt">
  ): Promise<StockItem> {
    const res = await this.pool.query(
      `INSERT INTO stock_items (
                tenant_id, 
                name, 
                unit_text, 
                barcode, 
                piece_size,
                is_ingredient,
                is_sellable,
                category_id,
                image_url,
                is_active,
                created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *`,
      [
        item.tenantId,
        item.name,
        item.unitText,
        item.barcode || null,
        item.pieceSize || null,
        item.isIngredient,
        item.isSellable,
        item.categoryId || null,
        item.imageUrl || null,
        item.isActive,
        item.createdBy,
      ]
    );
    return this.toEntity(res.rows[0]);
  }

  async update(
    id: string,
    updates: Partial<
      Omit<
        StockItem,
        "id" | "tenantId" | "createdAt" | "updatedAt" | "createdBy"
      >
    >
  ): Promise<StockItem | null> {
    const fields = Object.keys(updates);
    if (fields.length === 0) return this.findById(id);

    // Map camelCase to snake_case for DB columns
    const fieldMap: Record<string, string> = {
      name: "name",
      unitText: "unit_text",
      barcode: "barcode",
      pieceSize: "piece_size",
      isIngredient: "is_ingredient",
      isSellable: "is_sellable",
      categoryId: "category_id",
      imageUrl: "image_url",
      isActive: "is_active",
    };

    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 2; // Start at 2 since $1 is the id

    for (const field of fields) {
      const dbColumn = fieldMap[field];
      if (dbColumn) {
        setClauses.push(`${dbColumn} = $${paramIndex}`);
        values.push((updates as any)[field]);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) return this.findById(id);

    const query = `UPDATE stock_items SET ${setClauses.join(
      ", "
    )} WHERE id = $1 RETURNING *`;

    const res = await this.pool.query(query, [id, ...values]);
    if (res.rows.length === 0) return null;
    return this.toEntity(res.rows[0]);
  }

  async nullifyCategoryForItems(categoryId: string): Promise<void> {
    await this.pool.query(
      "UPDATE stock_items SET category_id = NULL WHERE category_id = $1",
      [categoryId]
    );
  }

  private toEntity(row: any): StockItem {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      unitText: row.unit_text,
      barcode: row.barcode,
      pieceSize: row.piece_size ? parseFloat(row.piece_size) : undefined,
      isIngredient: row.is_ingredient,
      isSellable: row.is_sellable,
      categoryId: row.category_id?.toString(),
      imageUrl: row.image_url,
      isActive: row.is_active,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
