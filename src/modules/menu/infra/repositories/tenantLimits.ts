import type { Pool } from "pg";
import type { ITenantLimitsRepository } from "../../app/ports.js";
import { TenantLimits } from "../../domain/tenant-limits.js";

export class TenantLimitsRepository implements ITenantLimitsRepository {
  constructor(private pool: Pool) {}

  async findByTenantId(tenantId: string): Promise<TenantLimits | null> {
    const sql = `
      SELECT * FROM menu_tenant_limits WHERE tenant_id = $1
    `;
    const result = await this.pool.query(sql, [tenantId]);
    if (result.rows.length === 0) return null;
    return this.mapRowToEntity(result.rows[0]);
  }

  async save(limits: TenantLimits): Promise<void> {
    const sql = `
      INSERT INTO menu_tenant_limits (
        tenant_id, max_categories_soft, max_categories_hard, max_items_soft, max_items_hard,
        max_modifier_groups_per_item, max_modifier_options_per_group, max_total_modifier_options_per_item, max_media_quota_mb
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (tenant_id) DO UPDATE SET
        max_categories_soft = EXCLUDED.max_categories_soft,
        max_categories_hard = EXCLUDED.max_categories_hard,
        max_items_soft = EXCLUDED.max_items_soft,
        max_items_hard = EXCLUDED.max_items_hard,
        max_modifier_groups_per_item = EXCLUDED.max_modifier_groups_per_item,
        max_modifier_options_per_group = EXCLUDED.max_modifier_options_per_group,
        max_total_modifier_options_per_item = EXCLUDED.max_total_modifier_options_per_item,
        max_media_quota_mb = EXCLUDED.max_media_quota_mb
    `;
    const p = limits.toPersistence();
    await this.pool.query(sql, [
      p.tenantId,
      p.maxCategoriesSoft,
      p.maxCategoriesHard,
      p.maxItemsSoft,
      p.maxItemsHard,
      p.maxModifierGroupsPerItem,
      p.maxModifierOptionsPerGroup,
      p.maxTotalModifierOptionsPerItem,
      p.maxMediaQuotaMb,
    ]);
  }

  async createDefault(tenantId: string): Promise<TenantLimits> {
    const limits = TenantLimits.createDefault(tenantId);
    await this.save(limits);
    return limits;
  }

  private mapRowToEntity(row: any): TenantLimits {
    return TenantLimits.fromPersistence({
      tenantId: row.tenant_id,
      maxCategoriesSoft: row.max_categories_soft,
      maxCategoriesHard: row.max_categories_hard,
      maxItemsSoft: row.max_items_soft,
      maxItemsHard: row.max_items_hard,
      maxModifierGroupsPerItem: row.max_modifier_groups_per_item,
      maxModifierOptionsPerGroup: row.max_modifier_options_per_group,
      maxTotalModifierOptionsPerItem: row.max_total_modifier_options_per_item,
      maxMediaQuotaMb: row.max_media_quota_mb,
    });
  }
}
