import { Pool, PoolClient } from 'pg';
import { Sale, SaleItem } from '../../domain/entities/sale.entity.js';
import { SalesRepository } from '../../app/ports/sales.ports.js';

export class PgSalesRepository implements SalesRepository {
  constructor(private pool: Pool) {}

  async findById(id: string, trx?: PoolClient): Promise<Sale | null> {
    const client = trx || this.pool;
    
    const saleResult = await client.query(
      `SELECT * FROM sales WHERE id = $1`,
      [id]
    );

    if (saleResult.rows.length === 0) {
      return null;
    }

    const items = await this.findItemsBySaleId(id, client);
    return this.mapToSale(saleResult.rows[0], items);
  }

  async findByClientUuid(clientUuid: string, trx?: PoolClient): Promise<Sale | null> {
    const client = trx || this.pool;
    
    const saleResult = await client.query(
      `SELECT * FROM sales WHERE client_uuid = $1 AND state = 'draft' ORDER BY created_at DESC LIMIT 1`,
      [clientUuid]
    );

    if (saleResult.rows.length === 0) {
      return null;
    }

    const items = await this.findItemsBySaleId(saleResult.rows[0].id, client);
    return this.mapToSale(saleResult.rows[0], items);
  }

  async save(sale: Sale, trx?: PoolClient): Promise<void> {
    const client = trx || this.pool;

    // Upsert sale
    await client.query(
      `INSERT INTO sales (
        id, client_uuid, tenant_id, branch_id, employee_id, sale_type, state, ref_previous_sale_id,
        vat_enabled, vat_rate, vat_amount_usd, vat_amount_khr_exact,
        applied_policy_ids, order_discount_type, order_discount_amount, policy_stale,
        fx_rate_used, subtotal_usd_exact, subtotal_khr_exact, total_usd_exact, total_khr_exact,
        tender_currency, khr_rounding_applied, total_khr_rounded, rounding_delta_khr,
        payment_method, cash_received_khr, cash_received_usd, change_given_khr, change_given_usd,
        fulfillment_status, created_at, updated_at, finalized_at, in_prep_at, ready_at, delivered_at, cancelled_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38)
      ON CONFLICT (id) DO UPDATE SET
        client_uuid = EXCLUDED.client_uuid,
        tenant_id = EXCLUDED.tenant_id,
        branch_id = EXCLUDED.branch_id,
        employee_id = EXCLUDED.employee_id,
        sale_type = EXCLUDED.sale_type,
        state = EXCLUDED.state,
        ref_previous_sale_id = EXCLUDED.ref_previous_sale_id,
        vat_enabled = EXCLUDED.vat_enabled,
        vat_rate = EXCLUDED.vat_rate,
        vat_amount_usd = EXCLUDED.vat_amount_usd,
        vat_amount_khr_exact = EXCLUDED.vat_amount_khr_exact,
        applied_policy_ids = EXCLUDED.applied_policy_ids,
        order_discount_type = EXCLUDED.order_discount_type,
        order_discount_amount = EXCLUDED.order_discount_amount,
        policy_stale = EXCLUDED.policy_stale,
        fx_rate_used = EXCLUDED.fx_rate_used,
        subtotal_usd_exact = EXCLUDED.subtotal_usd_exact,
        subtotal_khr_exact = EXCLUDED.subtotal_khr_exact,
        total_usd_exact = EXCLUDED.total_usd_exact,
        total_khr_exact = EXCLUDED.total_khr_exact,
        tender_currency = EXCLUDED.tender_currency,
        khr_rounding_applied = EXCLUDED.khr_rounding_applied,
        total_khr_rounded = EXCLUDED.total_khr_rounded,
        rounding_delta_khr = EXCLUDED.rounding_delta_khr,
        payment_method = EXCLUDED.payment_method,
        cash_received_khr = EXCLUDED.cash_received_khr,
        cash_received_usd = EXCLUDED.cash_received_usd,
        change_given_khr = EXCLUDED.change_given_khr,
        change_given_usd = EXCLUDED.change_given_usd,
        fulfillment_status = EXCLUDED.fulfillment_status,
        updated_at = EXCLUDED.updated_at,
        finalized_at = EXCLUDED.finalized_at,
        in_prep_at = EXCLUDED.in_prep_at,
        ready_at = EXCLUDED.ready_at,
        delivered_at = EXCLUDED.delivered_at,
        cancelled_at = EXCLUDED.cancelled_at`,
      [
        sale.id, sale.clientUuid, sale.tenantId, sale.branchId, sale.employeeId,
        sale.saleType, sale.state, sale.refPreviousSaleId || null, sale.vatEnabled, sale.vatRate, sale.vatAmountUsd,
        sale.vatAmountKhrExact, JSON.stringify(sale.appliedPolicyIds), sale.orderDiscountType,
        sale.orderDiscountAmount, sale.policyStale, sale.fxRateUsed, sale.subtotalUsdExact, sale.subtotalKhrExact,
        sale.totalUsdExact, sale.totalKhrExact,
        sale.tenderCurrency, sale.khrRoundingApplied, sale.totalKhrRounded, sale.roundingDeltaKhr,
        sale.paymentMethod, sale.cashReceivedKhr, sale.cashReceivedUsd, sale.changeGivenKhr,
        sale.changeGivenUsd, sale.fulfillmentStatus, sale.createdAt, sale.updatedAt,
        sale.finalizedAt, sale.inPrepAt, sale.readyAt, sale.deliveredAt, sale.cancelledAt
      ]
    );

    // Save items
    for (const item of sale.items) {
      await client.query(
        `INSERT INTO sale_items (
          id, sale_id, menu_item_id, menu_item_name, unit_price_usd, unit_price_khr_exact,
          modifiers, quantity, line_total_usd_exact, line_total_khr_exact,
          line_discount_type, line_discount_amount, line_applied_policy_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (id) DO UPDATE SET
          menu_item_id = EXCLUDED.menu_item_id,
          menu_item_name = EXCLUDED.menu_item_name,
          unit_price_usd = EXCLUDED.unit_price_usd,
          unit_price_khr_exact = EXCLUDED.unit_price_khr_exact,
          modifiers = EXCLUDED.modifiers,
          quantity = EXCLUDED.quantity,
          line_total_usd_exact = EXCLUDED.line_total_usd_exact,
          line_total_khr_exact = EXCLUDED.line_total_khr_exact,
          line_discount_type = EXCLUDED.line_discount_type,
          line_discount_amount = EXCLUDED.line_discount_amount,
          line_applied_policy_id = EXCLUDED.line_applied_policy_id,
          updated_at = EXCLUDED.updated_at`,
        [
          item.id, sale.id, item.menuItemId, item.menuItemName, item.unitPriceUsd, item.unitPriceKhrExact,
          JSON.stringify(item.modifiers), item.quantity, item.lineTotalUsdExact, item.lineTotalKhrExact,
          item.lineDiscountType, item.lineDiscountAmount, item.lineAppliedPolicyId, item.createdAt, item.updatedAt
        ]
      );
    }

    // Remove items that are no longer in the sale
    const currentItemIds = sale.items.map(item => item.id);
    await client.query(
      `DELETE FROM sale_items WHERE sale_id = $1 AND id != ALL($2)`,
      [sale.id, currentItemIds]
    );
  }

  async findSalesByBranch(params: {
    tenantId: string;
    branchId: string;
    status?: string;
    saleType?: string;
    startDate?: string;
    endDate?: string;
    page: number;
    limit: number;
  }, trx?: PoolClient): Promise<{ sales: Sale[]; total: number }> {
    const client = trx || this.pool;
    
    let whereConditions = ['tenant_id = $1', 'branch_id = $2'];
    let queryParams: any[] = [params.tenantId, params.branchId];
    let paramCount = 2;

    if (params.status) {
      paramCount++;
      whereConditions.push(`state = $${paramCount}`);
      queryParams.push(params.status);
    }

    if (params.saleType) {
      paramCount++;
      whereConditions.push(`sale_type = $${paramCount}`);
      queryParams.push(params.saleType);
    }

    if (params.startDate) {
      paramCount++;
      whereConditions.push(`created_at >= $${paramCount}`);
      queryParams.push(params.startDate);
    }

    if (params.endDate) {
      paramCount++;
      whereConditions.push(`created_at <= $${paramCount}`);
      queryParams.push(params.endDate);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Count query
    const countResult = await client.query(
      `SELECT COUNT(*) FROM sales ${whereClause}`,
      queryParams
    );
    const total = parseInt(countResult.rows[0].count);

    // Data query
    const offset = (params.page - 1) * params.limit;
    queryParams.push(params.limit, offset);

    const salesResult = await client.query(
      `SELECT * FROM sales ${whereClause} ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
      queryParams
    );

    const sales: Sale[] = [];
    for (const row of salesResult.rows) {
      const items = await this.findItemsBySaleId(row.id, client);
      sales.push(this.mapToSale(row, items));
    }

    return { sales, total };
  }

  async findTodaySales(tenantId: string, branchId: string, trx?: PoolClient): Promise<Sale[]> {
    const client = trx || this.pool;
    
    const salesResult = await client.query(
      `SELECT * FROM sales 
       WHERE tenant_id = $1 AND branch_id = $2 AND created_at::date = CURRENT_DATE
       ORDER BY created_at DESC`,
      [tenantId, branchId]
    );

    const sales: Sale[] = [];
    for (const row of salesResult.rows) {
      const items = await this.findItemsBySaleId(row.id, client);
      sales.push(this.mapToSale(row, items));
    }

    return sales;
  }

  async writeAuditLog(entry: {
    tenantId: string;
    branchId: string;
    saleId: string;
    actorId: string;
    action: string;
    reason?: string;
    oldValues?: any;
    newValues?: any;
  }, trx?: PoolClient): Promise<void> {
    const client = trx || this.pool;
    
    await client.query(
      `INSERT INTO sales_audit_log (tenant_id, branch_id, sale_id, actor_id, action, reason, old_values, new_values)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entry.tenantId,
        entry.branchId,
        entry.saleId,
        entry.actorId,
        entry.action,
        entry.reason || null,
        entry.oldValues ? JSON.stringify(entry.oldValues) : null,
        entry.newValues ? JSON.stringify(entry.newValues) : null
      ]
    );
  }

  private async findItemsBySaleId(saleId: string, client: Pool | PoolClient): Promise<SaleItem[]> {
    const itemsResult = await client.query(
      `SELECT * FROM sale_items WHERE sale_id = $1 ORDER BY created_at`,
      [saleId]
    );

    return itemsResult.rows.map(row => this.mapToSaleItem(row));
  }

  private mapToSale(row: any, items: SaleItem[]): Sale {
    return {
      id: row.id,
      clientUuid: row.client_uuid,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      employeeId: row.employee_id,
      saleType: row.sale_type,
      state: row.state,
      refPreviousSaleId: row.ref_previous_sale_id || undefined,
      vatEnabled: row.vat_enabled,
      vatRate: parseFloat(row.vat_rate || 0),
      vatAmountUsd: parseFloat(row.vat_amount_usd || 0),
      vatAmountKhrExact: row.vat_amount_khr_exact || 0,
      appliedPolicyIds: row.applied_policy_ids || [],
      orderDiscountType: row.order_discount_type,
      orderDiscountAmount: parseFloat(row.order_discount_amount || 0),
      policyStale: row.policy_stale || false,
      fxRateUsed: parseFloat(row.fx_rate_used),
      subtotalUsdExact: parseFloat(row.subtotal_usd_exact || 0),
      subtotalKhrExact: row.subtotal_khr_exact || 0,
      totalUsdExact: parseFloat(row.total_usd_exact),
      totalKhrExact: row.total_khr_exact,
      tenderCurrency: row.tender_currency,
      khrRoundingApplied: row.khr_rounding_applied,
      totalKhrRounded: row.total_khr_rounded,
      roundingDeltaKhr: row.rounding_delta_khr,
      paymentMethod: row.payment_method,
      cashReceivedKhr: row.cash_received_khr,
      cashReceivedUsd: row.cash_received_usd ? parseFloat(row.cash_received_usd) : undefined,
      changeGivenKhr: row.change_given_khr,
      changeGivenUsd: row.change_given_usd ? parseFloat(row.change_given_usd) : undefined,
      fulfillmentStatus: row.fulfillment_status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      finalizedAt: row.finalized_at ? new Date(row.finalized_at) : undefined,
      inPrepAt: row.in_prep_at ? new Date(row.in_prep_at) : undefined,
      readyAt: row.ready_at ? new Date(row.ready_at) : undefined,
      deliveredAt: row.delivered_at ? new Date(row.delivered_at) : undefined,
      cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : undefined,
      items
    };
  }

  private mapToSaleItem(row: any): SaleItem {
    return {
      id: row.id,
      saleId: row.sale_id,
      menuItemId: row.menu_item_id,
      menuItemName: row.menu_item_name,
      unitPriceUsd: parseFloat(row.unit_price_usd),
      unitPriceKhrExact: row.unit_price_khr_exact,
      modifiers: row.modifiers || [],
      quantity: row.quantity,
      lineTotalUsdExact: parseFloat(row.line_total_usd_exact),
      lineTotalKhrExact: row.line_total_khr_exact,
      lineDiscountType: row.line_discount_type,
      lineDiscountAmount: parseFloat(row.line_discount_amount || 0),
      lineAppliedPolicyId: row.line_applied_policy_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}