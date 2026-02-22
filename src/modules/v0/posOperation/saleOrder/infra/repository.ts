import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type V0OrderTicketStatus = "OPEN" | "CHECKED_OUT" | "CANCELLED";
export type V0SaleStatus = "PENDING" | "FINALIZED" | "VOID_PENDING" | "VOIDED";
export type V0SalePaymentMethod = "CASH" | "KHQR";
export type V0TenderCurrency = "USD" | "KHR";
export type V0VoidRequestStatus = "PENDING" | "APPROVED" | "REJECTED";
export type V0OrderFulfillmentBatchStatus =
  | "PENDING"
  | "PREPARING"
  | "READY"
  | "COMPLETED"
  | "CANCELLED";

export type V0OrderTicketRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  opened_by_account_id: string;
  status: V0OrderTicketStatus;
  checked_out_at: Date | null;
  checked_out_by_account_id: string | null;
  cancelled_at: Date | null;
  cancelled_by_account_id: string | null;
  cancel_reason: string | null;
  created_at: Date;
  updated_at: Date;
};

export type V0OrderTicketLineRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  order_ticket_id: string;
  menu_item_id: string;
  menu_item_name_snapshot: string;
  unit_price: number;
  quantity: number;
  line_subtotal: number;
  modifier_snapshot: unknown;
  note: string | null;
  created_at: Date;
  updated_at: Date;
};

export type V0OrderMenuItemRow = {
  id: string;
  tenant_id: string;
  name: string;
  base_price: number;
};

export type V0OrderMenuModifierGroupRow = {
  id: string;
  tenant_id: string;
  name: string;
  selection_mode: "SINGLE" | "MULTI";
  min_selections: number;
  max_selections: number;
  is_required: boolean;
};

export type V0OrderMenuModifierOptionRow = {
  id: string;
  tenant_id: string;
  modifier_group_id: string;
  label: string;
  price_delta: number;
};

export type V0SaleRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  order_ticket_id: string | null;
  status: V0SaleStatus;
  payment_method: V0SalePaymentMethod;
  tender_currency: V0TenderCurrency;
  tender_amount: number;
  cash_received_tender_amount: number | null;
  cash_change_tender_amount: number;
  khqr_md5: string | null;
  khqr_to_account_id: string | null;
  khqr_hash: string | null;
  khqr_confirmed_at: Date | null;
  subtotal_usd: number;
  subtotal_khr: number;
  discount_usd: number;
  discount_khr: number;
  vat_usd: number;
  vat_khr: number;
  grand_total_usd: number;
  grand_total_khr: number;
  sale_fx_rate_khr_per_usd: number;
  sale_khr_rounding_enabled: boolean;
  sale_khr_rounding_mode: "NEAREST" | "UP" | "DOWN";
  sale_khr_rounding_granularity: 100 | 1000;
  subtotal_amount: number;
  discount_amount: number;
  vat_amount: number;
  total_amount: number;
  paid_amount: number;
  finalized_at: Date | null;
  finalized_by_account_id: string | null;
  voided_at: Date | null;
  voided_by_account_id: string | null;
  void_reason: string | null;
  created_at: Date;
  updated_at: Date;
};

export type V0SaleLineRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  sale_id: string;
  order_ticket_line_id: string | null;
  menu_item_id: string;
  menu_item_name_snapshot: string;
  unit_price: number;
  quantity: number;
  line_discount_amount: number;
  line_total_amount: number;
  modifier_snapshot: unknown;
  created_at: Date;
  updated_at: Date;
};

export type V0VoidRequestRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  sale_id: string;
  requested_by_account_id: string;
  reviewed_by_account_id: string | null;
  status: V0VoidRequestStatus;
  reason: string;
  review_note: string | null;
  requested_at: Date;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type V0OrderFulfillmentBatchRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  order_ticket_id: string;
  status: V0OrderFulfillmentBatchStatus;
  note: string | null;
  created_by_account_id: string;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

const ORDER_TICKET_SELECT = `
  id,
  tenant_id,
  branch_id,
  opened_by_account_id,
  status,
  checked_out_at,
  checked_out_by_account_id,
  cancelled_at,
  cancelled_by_account_id,
  cancel_reason,
  created_at,
  updated_at
`;

const ORDER_TICKET_LINE_SELECT = `
  id,
  tenant_id,
  branch_id,
  order_ticket_id,
  menu_item_id,
  menu_item_name_snapshot,
  unit_price::FLOAT8 AS unit_price,
  quantity::FLOAT8 AS quantity,
  line_subtotal::FLOAT8 AS line_subtotal,
  modifier_snapshot,
  note,
  created_at,
  updated_at
`;

const SALE_SELECT = `
  id,
  tenant_id,
  branch_id,
  order_ticket_id,
  status,
  payment_method,
  tender_currency,
  tender_amount::FLOAT8 AS tender_amount,
  cash_received_tender_amount::FLOAT8 AS cash_received_tender_amount,
  cash_change_tender_amount::FLOAT8 AS cash_change_tender_amount,
  khqr_md5,
  khqr_to_account_id,
  khqr_hash,
  khqr_confirmed_at,
  subtotal_usd::FLOAT8 AS subtotal_usd,
  subtotal_khr::FLOAT8 AS subtotal_khr,
  discount_usd::FLOAT8 AS discount_usd,
  discount_khr::FLOAT8 AS discount_khr,
  vat_usd::FLOAT8 AS vat_usd,
  vat_khr::FLOAT8 AS vat_khr,
  grand_total_usd::FLOAT8 AS grand_total_usd,
  grand_total_khr::FLOAT8 AS grand_total_khr,
  sale_fx_rate_khr_per_usd::FLOAT8 AS sale_fx_rate_khr_per_usd,
  sale_khr_rounding_enabled,
  sale_khr_rounding_mode,
  sale_khr_rounding_granularity,
  subtotal_amount::FLOAT8 AS subtotal_amount,
  discount_amount::FLOAT8 AS discount_amount,
  vat_amount::FLOAT8 AS vat_amount,
  total_amount::FLOAT8 AS total_amount,
  paid_amount::FLOAT8 AS paid_amount,
  finalized_at,
  finalized_by_account_id,
  voided_at,
  voided_by_account_id,
  void_reason,
  created_at,
  updated_at
`;

const SALE_LINE_SELECT = `
  id,
  tenant_id,
  branch_id,
  sale_id,
  order_ticket_line_id,
  menu_item_id,
  menu_item_name_snapshot,
  unit_price::FLOAT8 AS unit_price,
  quantity::FLOAT8 AS quantity,
  line_discount_amount::FLOAT8 AS line_discount_amount,
  line_total_amount::FLOAT8 AS line_total_amount,
  modifier_snapshot,
  created_at,
  updated_at
`;

const VOID_REQUEST_SELECT = `
  id,
  tenant_id,
  branch_id,
  sale_id,
  requested_by_account_id,
  reviewed_by_account_id,
  status,
  reason,
  review_note,
  requested_at,
  reviewed_at,
  created_at,
  updated_at
`;

const FULFILLMENT_BATCH_SELECT = `
  id,
  tenant_id,
  branch_id,
  order_ticket_id,
  status,
  note,
  created_by_account_id,
  completed_at,
  created_at,
  updated_at
`;

export class V0SaleOrderRepository {
  constructor(private readonly db: Queryable) {}

  async hasOpenCashSession(input: {
    tenantId: string;
    branchId: string;
  }): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM v0_cash_sessions
         WHERE tenant_id = $1
           AND branch_id = $2
           AND status = 'OPEN'
       ) AS exists`,
      [input.tenantId, input.branchId]
    );
    return result.rows[0]?.exists === true;
  }

  async getBranchEntitlementEnforcement(input: {
    tenantId: string;
    branchId: string;
    entitlementKey: string;
  }): Promise<"ENABLED" | "READ_ONLY" | "DISABLED_VISIBLE"> {
    const result = await this.db.query<{
      enforcement: "ENABLED" | "READ_ONLY" | "DISABLED_VISIBLE";
    }>(
      `SELECT enforcement
       FROM v0_branch_entitlements
       WHERE tenant_id = $1
         AND branch_id = $2
         AND entitlement_key = $3
       LIMIT 1`,
      [input.tenantId, input.branchId, input.entitlementKey]
    );
    return result.rows[0]?.enforcement ?? "ENABLED";
  }

  async getActiveMenuItemVisibleInBranch(input: {
    tenantId: string;
    branchId: string;
    menuItemId: string;
  }): Promise<V0OrderMenuItemRow | null> {
    const result = await this.db.query<V0OrderMenuItemRow>(
      `SELECT
         i.id,
         i.tenant_id,
         i.name,
         i.base_price::FLOAT8 AS base_price
       FROM v0_menu_items i
       INNER JOIN v0_menu_item_branch_visibility vis
         ON vis.tenant_id = i.tenant_id
        AND vis.menu_item_id = i.id
       WHERE i.tenant_id = $1
         AND vis.branch_id = $2
         AND i.id = $3
         AND i.status = 'ACTIVE'
       LIMIT 1`,
      [input.tenantId, input.branchId, input.menuItemId]
    );
    return result.rows[0] ?? null;
  }

  async listActiveModifierGroupsForMenuItem(input: {
    tenantId: string;
    menuItemId: string;
  }): Promise<V0OrderMenuModifierGroupRow[]> {
    const result = await this.db.query<V0OrderMenuModifierGroupRow>(
      `SELECT
         g.id,
         g.tenant_id,
         g.name,
         g.selection_mode,
         g.min_selections,
         g.max_selections,
         g.is_required
       FROM v0_menu_item_modifier_group_links l
       INNER JOIN v0_menu_modifier_groups g
         ON g.tenant_id = l.tenant_id
        AND g.id = l.modifier_group_id
       WHERE l.tenant_id = $1
         AND l.menu_item_id = $2
         AND g.status = 'ACTIVE'
       ORDER BY l.display_order ASC, g.id ASC`,
      [input.tenantId, input.menuItemId]
    );
    return result.rows;
  }

  async listActiveModifierOptionsByGroupIds(input: {
    tenantId: string;
    groupIds: readonly string[];
  }): Promise<V0OrderMenuModifierOptionRow[]> {
    if (input.groupIds.length === 0) {
      return [];
    }
    const result = await this.db.query<V0OrderMenuModifierOptionRow>(
      `SELECT
         id,
         tenant_id,
         modifier_group_id,
         label,
         price_delta::FLOAT8 AS price_delta
       FROM v0_menu_modifier_options
       WHERE tenant_id = $1
         AND modifier_group_id = ANY($2::UUID[])
         AND status = 'ACTIVE'
       ORDER BY modifier_group_id ASC, label ASC, id ASC`,
      [input.tenantId, input.groupIds]
    );
    return result.rows;
  }

  async createOrderTicket(input: {
    tenantId: string;
    branchId: string;
    openedByAccountId: string;
  }): Promise<V0OrderTicketRow> {
    const result = await this.db.query<V0OrderTicketRow>(
      `INSERT INTO v0_order_tickets (
         tenant_id,
         branch_id,
         opened_by_account_id
       )
       VALUES ($1, $2, $3)
       RETURNING ${ORDER_TICKET_SELECT}`,
      [input.tenantId, input.branchId, input.openedByAccountId]
    );
    return result.rows[0];
  }

  async getOrderTicketById(input: {
    tenantId: string;
    branchId: string;
    orderTicketId: string;
  }): Promise<V0OrderTicketRow | null> {
    const result = await this.db.query<V0OrderTicketRow>(
      `SELECT
         ${ORDER_TICKET_SELECT}
       FROM v0_order_tickets
       WHERE tenant_id = $1
         AND branch_id = $2
         AND id = $3
       LIMIT 1`,
      [input.tenantId, input.branchId, input.orderTicketId]
    );
    return result.rows[0] ?? null;
  }

  async listOrderTickets(input: {
    tenantId: string;
    branchId: string;
    status?: V0OrderTicketStatus | null;
    limit: number;
    offset: number;
  }): Promise<V0OrderTicketRow[]> {
    const result = await this.db.query<V0OrderTicketRow>(
      `SELECT
         ${ORDER_TICKET_SELECT}
       FROM v0_order_tickets
       WHERE tenant_id = $1
         AND branch_id = $2
         AND ($3::VARCHAR IS NULL OR status = $3::VARCHAR)
       ORDER BY created_at DESC, id DESC
       LIMIT $4
       OFFSET $5`,
      [
        input.tenantId,
        input.branchId,
        input.status ?? null,
        input.limit,
        input.offset,
      ]
    );
    return result.rows;
  }

  async markOrderTicketCheckedOut(input: {
    tenantId: string;
    branchId: string;
    orderTicketId: string;
    checkedOutByAccountId: string;
  }): Promise<V0OrderTicketRow | null> {
    const result = await this.db.query<V0OrderTicketRow>(
      `UPDATE v0_order_tickets
       SET status = 'CHECKED_OUT',
           checked_out_at = NOW(),
           checked_out_by_account_id = $4,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND branch_id = $2
         AND id = $3
       RETURNING ${ORDER_TICKET_SELECT}`,
      [
        input.tenantId,
        input.branchId,
        input.orderTicketId,
        input.checkedOutByAccountId,
      ]
    );
    return result.rows[0] ?? null;
  }

  async cancelOrderTicket(input: {
    tenantId: string;
    branchId: string;
    orderTicketId: string;
    cancelledByAccountId: string;
    cancelReason: string | null;
  }): Promise<V0OrderTicketRow | null> {
    const result = await this.db.query<V0OrderTicketRow>(
      `UPDATE v0_order_tickets
       SET status = 'CANCELLED',
           cancelled_at = NOW(),
           cancelled_by_account_id = $4,
           cancel_reason = $5,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND branch_id = $2
         AND id = $3
       RETURNING ${ORDER_TICKET_SELECT}`,
      [
        input.tenantId,
        input.branchId,
        input.orderTicketId,
        input.cancelledByAccountId,
        input.cancelReason,
      ]
    );
    return result.rows[0] ?? null;
  }

  async createOrderTicketLine(input: {
    tenantId: string;
    branchId: string;
    orderTicketId: string;
    menuItemId: string;
    menuItemNameSnapshot: string;
    unitPrice: number;
    quantity: number;
    lineSubtotal: number;
    modifierSnapshot?: unknown;
    note?: string | null;
  }): Promise<V0OrderTicketLineRow> {
    const result = await this.db.query<V0OrderTicketLineRow>(
      `INSERT INTO v0_order_ticket_lines (
         tenant_id,
         branch_id,
         order_ticket_id,
         menu_item_id,
         menu_item_name_snapshot,
         unit_price,
         quantity,
         line_subtotal,
         modifier_snapshot,
         note
       )
       VALUES ($1, $2, $3, $4, $5, $6::NUMERIC(14,2), $7::NUMERIC(12,3), $8::NUMERIC(14,2), $9::JSONB, $10)
       RETURNING ${ORDER_TICKET_LINE_SELECT}`,
      [
        input.tenantId,
        input.branchId,
        input.orderTicketId,
        input.menuItemId,
        input.menuItemNameSnapshot,
        input.unitPrice,
        input.quantity,
        input.lineSubtotal,
        input.modifierSnapshot ?? [],
        input.note ?? null,
      ]
    );
    return result.rows[0];
  }

  async listOrderTicketLines(input: {
    tenantId: string;
    orderTicketId: string;
  }): Promise<V0OrderTicketLineRow[]> {
    const result = await this.db.query<V0OrderTicketLineRow>(
      `SELECT
         ${ORDER_TICKET_LINE_SELECT}
       FROM v0_order_ticket_lines
       WHERE tenant_id = $1
         AND order_ticket_id = $2
       ORDER BY created_at ASC, id ASC`,
      [input.tenantId, input.orderTicketId]
    );
    return result.rows;
  }

  async createSale(input: {
    tenantId: string;
    branchId: string;
    orderTicketId?: string | null;
    paymentMethod: V0SalePaymentMethod;
    tenderCurrency: V0TenderCurrency;
    tenderAmount: number;
    cashReceivedTenderAmount?: number | null;
    cashChangeTenderAmount?: number;
    khqrMd5?: string | null;
    khqrToAccountId?: string | null;
    khqrHash?: string | null;
    khqrConfirmedAt?: Date | null;
    subtotalUsd: number;
    subtotalKhr: number;
    discountUsd: number;
    discountKhr: number;
    vatUsd: number;
    vatKhr: number;
    grandTotalUsd: number;
    grandTotalKhr: number;
    saleFxRateKhrPerUsd: number;
    saleKhrRoundingEnabled: boolean;
    saleKhrRoundingMode: "NEAREST" | "UP" | "DOWN";
    saleKhrRoundingGranularity: 100 | 1000;
    paidAmount?: number;
  }): Promise<V0SaleRow> {
    const result = await this.db.query<V0SaleRow>(
      `INSERT INTO v0_sales (
         tenant_id,
         branch_id,
         order_ticket_id,
         payment_method,
         tender_currency,
         tender_amount,
         cash_received_tender_amount,
         cash_change_tender_amount,
         khqr_md5,
         khqr_to_account_id,
         khqr_hash,
         khqr_confirmed_at,
         subtotal_usd,
         subtotal_khr,
         discount_usd,
         discount_khr,
         vat_usd,
         vat_khr,
         grand_total_usd,
         grand_total_khr,
         sale_fx_rate_khr_per_usd,
         sale_khr_rounding_enabled,
         sale_khr_rounding_mode,
         sale_khr_rounding_granularity,
         subtotal_amount,
         discount_amount,
         vat_amount,
         total_amount,
         paid_amount
       )
       VALUES (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6::NUMERIC(14,2),
         $7::NUMERIC(14,2),
         $8::NUMERIC(14,2),
         $9,
         $10,
         $11,
         $12,
         $13::NUMERIC(14,2),
         $14::NUMERIC(14,2),
         $15::NUMERIC(14,2),
         $16::NUMERIC(14,2),
         $17::NUMERIC(14,2),
         $18::NUMERIC(14,2),
         $19::NUMERIC(14,2),
         $20::NUMERIC(14,2),
         $21::NUMERIC(14,4),
         $22,
         $23,
         $24,
         $25::NUMERIC(14,2),
         $26::NUMERIC(14,2),
         $27::NUMERIC(14,2),
         $28::NUMERIC(14,2),
         $29::NUMERIC(14,2)
       )
       RETURNING ${SALE_SELECT}`,
      [
        input.tenantId,
        input.branchId,
        input.orderTicketId ?? null,
        input.paymentMethod,
        input.tenderCurrency,
        input.tenderAmount,
        input.cashReceivedTenderAmount ?? null,
        input.cashChangeTenderAmount ?? 0,
        input.khqrMd5 ?? null,
        input.khqrToAccountId ?? null,
        input.khqrHash ?? null,
        input.khqrConfirmedAt ?? null,
        input.subtotalUsd,
        input.subtotalKhr,
        input.discountUsd,
        input.discountKhr,
        input.vatUsd,
        input.vatKhr,
        input.grandTotalUsd,
        input.grandTotalKhr,
        input.saleFxRateKhrPerUsd,
        input.saleKhrRoundingEnabled,
        input.saleKhrRoundingMode,
        input.saleKhrRoundingGranularity,
        input.subtotalUsd,
        input.discountUsd,
        input.vatUsd,
        input.grandTotalUsd,
        input.paidAmount ?? 0,
      ]
    );
    return result.rows[0];
  }

  async getSaleById(input: {
    tenantId: string;
    branchId: string;
    saleId: string;
  }): Promise<V0SaleRow | null> {
    const result = await this.db.query<V0SaleRow>(
      `SELECT
         ${SALE_SELECT}
       FROM v0_sales
       WHERE tenant_id = $1
         AND branch_id = $2
         AND id = $3
       LIMIT 1`,
      [input.tenantId, input.branchId, input.saleId]
    );
    return result.rows[0] ?? null;
  }

  async getSaleByOrderTicketId(input: {
    tenantId: string;
    branchId: string;
    orderTicketId: string;
  }): Promise<V0SaleRow | null> {
    const result = await this.db.query<V0SaleRow>(
      `SELECT
         ${SALE_SELECT}
       FROM v0_sales
       WHERE tenant_id = $1
         AND branch_id = $2
         AND order_ticket_id = $3
       LIMIT 1`,
      [input.tenantId, input.branchId, input.orderTicketId]
    );
    return result.rows[0] ?? null;
  }

  async listSales(input: {
    tenantId: string;
    branchId: string;
    status?: V0SaleStatus | null;
    limit: number;
    offset: number;
  }): Promise<V0SaleRow[]> {
    const result = await this.db.query<V0SaleRow>(
      `SELECT
         ${SALE_SELECT}
       FROM v0_sales
       WHERE tenant_id = $1
         AND branch_id = $2
         AND ($3::VARCHAR IS NULL OR status = $3::VARCHAR)
       ORDER BY created_at DESC, id DESC
       LIMIT $4
       OFFSET $5`,
      [
        input.tenantId,
        input.branchId,
        input.status ?? null,
        input.limit,
        input.offset,
      ]
    );
    return result.rows;
  }

  async markSaleFinalized(input: {
    tenantId: string;
    branchId: string;
    saleId: string;
    finalizedByAccountId: string;
    paidAmount: number;
    tenderAmount?: number;
    cashReceivedTenderAmount?: number | null;
    cashChangeTenderAmount?: number;
    khqrHash?: string | null;
    khqrConfirmedAt?: Date | null;
  }): Promise<V0SaleRow | null> {
    const result = await this.db.query<V0SaleRow>(
      `UPDATE v0_sales
       SET status = 'FINALIZED',
           paid_amount = $5::NUMERIC(14,2),
           tender_amount = COALESCE($6::NUMERIC(14,2), tender_amount),
           cash_received_tender_amount = CASE
             WHEN $7::NUMERIC(14,2) IS NULL THEN cash_received_tender_amount
             ELSE $7::NUMERIC(14,2)
           END,
           cash_change_tender_amount = COALESCE($8::NUMERIC(14,2), cash_change_tender_amount),
           khqr_hash = COALESCE($9, khqr_hash),
           khqr_confirmed_at = COALESCE($10, khqr_confirmed_at),
           finalized_at = NOW(),
           finalized_by_account_id = $4,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND branch_id = $2
         AND id = $3
       RETURNING ${SALE_SELECT}`,
      [
        input.tenantId,
        input.branchId,
        input.saleId,
        input.finalizedByAccountId,
        input.paidAmount,
        input.tenderAmount ?? null,
        input.cashReceivedTenderAmount ?? null,
        input.cashChangeTenderAmount ?? null,
        input.khqrHash ?? null,
        input.khqrConfirmedAt ?? null,
      ]
    );
    return result.rows[0] ?? null;
  }

  async markSaleVoidPending(input: {
    tenantId: string;
    branchId: string;
    saleId: string;
  }): Promise<V0SaleRow | null> {
    const result = await this.db.query<V0SaleRow>(
      `UPDATE v0_sales
       SET status = 'VOID_PENDING',
           updated_at = NOW()
       WHERE tenant_id = $1
         AND branch_id = $2
         AND id = $3
       RETURNING ${SALE_SELECT}`,
      [input.tenantId, input.branchId, input.saleId]
    );
    return result.rows[0] ?? null;
  }

  async markSaleVoided(input: {
    tenantId: string;
    branchId: string;
    saleId: string;
    voidedByAccountId: string;
    voidReason?: string | null;
  }): Promise<V0SaleRow | null> {
    const result = await this.db.query<V0SaleRow>(
      `UPDATE v0_sales
       SET status = 'VOIDED',
           voided_at = NOW(),
           voided_by_account_id = $4,
           void_reason = $5,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND branch_id = $2
         AND id = $3
       RETURNING ${SALE_SELECT}`,
      [
        input.tenantId,
        input.branchId,
        input.saleId,
        input.voidedByAccountId,
        input.voidReason ?? null,
      ]
    );
    return result.rows[0] ?? null;
  }

  async createSaleLine(input: {
    tenantId: string;
    branchId: string;
    saleId: string;
    orderTicketLineId?: string | null;
    menuItemId: string;
    menuItemNameSnapshot: string;
    unitPrice: number;
    quantity: number;
    lineDiscountAmount: number;
    lineTotalAmount: number;
    modifierSnapshot?: unknown;
  }): Promise<V0SaleLineRow> {
    const result = await this.db.query<V0SaleLineRow>(
      `INSERT INTO v0_sale_lines (
         tenant_id,
         branch_id,
         sale_id,
         order_ticket_line_id,
         menu_item_id,
         menu_item_name_snapshot,
         unit_price,
         quantity,
         line_discount_amount,
         line_total_amount,
         modifier_snapshot
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::NUMERIC(14,2), $8::NUMERIC(12,3), $9::NUMERIC(14,2), $10::NUMERIC(14,2), $11::JSONB)
       RETURNING ${SALE_LINE_SELECT}`,
      [
        input.tenantId,
        input.branchId,
        input.saleId,
        input.orderTicketLineId ?? null,
        input.menuItemId,
        input.menuItemNameSnapshot,
        input.unitPrice,
        input.quantity,
        input.lineDiscountAmount,
        input.lineTotalAmount,
        input.modifierSnapshot ?? [],
      ]
    );
    return result.rows[0];
  }

  async listSaleLines(input: {
    tenantId: string;
    saleId: string;
  }): Promise<V0SaleLineRow[]> {
    const result = await this.db.query<V0SaleLineRow>(
      `SELECT
         ${SALE_LINE_SELECT}
       FROM v0_sale_lines
       WHERE tenant_id = $1
         AND sale_id = $2
       ORDER BY created_at ASC, id ASC`,
      [input.tenantId, input.saleId]
    );
    return result.rows;
  }

  async createVoidRequest(input: {
    tenantId: string;
    branchId: string;
    saleId: string;
    requestedByAccountId: string;
    status: V0VoidRequestStatus;
    reason: string;
    reviewedByAccountId?: string | null;
    reviewedAt?: Date | null;
    reviewNote?: string | null;
  }): Promise<V0VoidRequestRow> {
    const result = await this.db.query<V0VoidRequestRow>(
      `INSERT INTO v0_void_requests (
         tenant_id,
         branch_id,
         sale_id,
         requested_by_account_id,
         status,
         reason,
         reviewed_by_account_id,
         reviewed_at,
         review_note
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${VOID_REQUEST_SELECT}`,
      [
        input.tenantId,
        input.branchId,
        input.saleId,
        input.requestedByAccountId,
        input.status,
        input.reason,
        input.reviewedByAccountId ?? null,
        input.reviewedAt ?? null,
        input.reviewNote ?? null,
      ]
    );
    return result.rows[0];
  }

  async getPendingVoidRequestBySale(input: {
    tenantId: string;
    branchId: string;
    saleId: string;
  }): Promise<V0VoidRequestRow | null> {
    const result = await this.db.query<V0VoidRequestRow>(
      `SELECT
         ${VOID_REQUEST_SELECT}
       FROM v0_void_requests
       WHERE tenant_id = $1
         AND branch_id = $2
         AND sale_id = $3
         AND status = 'PENDING'
       ORDER BY requested_at DESC, id DESC
       LIMIT 1`,
      [input.tenantId, input.branchId, input.saleId]
    );
    return result.rows[0] ?? null;
  }

  async getLatestVoidRequestBySale(input: {
    tenantId: string;
    branchId: string;
    saleId: string;
  }): Promise<V0VoidRequestRow | null> {
    const result = await this.db.query<V0VoidRequestRow>(
      `SELECT
         ${VOID_REQUEST_SELECT}
       FROM v0_void_requests
       WHERE tenant_id = $1
         AND branch_id = $2
         AND sale_id = $3
       ORDER BY requested_at DESC, id DESC
       LIMIT 1`,
      [input.tenantId, input.branchId, input.saleId]
    );
    return result.rows[0] ?? null;
  }

  async resolveVoidRequest(input: {
    tenantId: string;
    branchId: string;
    voidRequestId: string;
    reviewedByAccountId: string;
    status: Extract<V0VoidRequestStatus, "APPROVED" | "REJECTED">;
    reviewNote?: string | null;
  }): Promise<V0VoidRequestRow | null> {
    const result = await this.db.query<V0VoidRequestRow>(
      `UPDATE v0_void_requests
       SET status = $5,
           reviewed_by_account_id = $4,
           reviewed_at = NOW(),
           review_note = $6,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND branch_id = $2
         AND id = $3
         AND status = 'PENDING'
       RETURNING ${VOID_REQUEST_SELECT}`,
      [
        input.tenantId,
        input.branchId,
        input.voidRequestId,
        input.reviewedByAccountId,
        input.status,
        input.reviewNote ?? null,
      ]
    );
    return result.rows[0] ?? null;
  }

  async createFulfillmentBatch(input: {
    tenantId: string;
    branchId: string;
    orderTicketId: string;
    status: V0OrderFulfillmentBatchStatus;
    note?: string | null;
    createdByAccountId: string;
  }): Promise<V0OrderFulfillmentBatchRow> {
    const result = await this.db.query<V0OrderFulfillmentBatchRow>(
      `INSERT INTO v0_order_fulfillment_batches (
         tenant_id,
         branch_id,
         order_ticket_id,
         status,
         note,
         created_by_account_id
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${FULFILLMENT_BATCH_SELECT}`,
      [
        input.tenantId,
        input.branchId,
        input.orderTicketId,
        input.status,
        input.note ?? null,
        input.createdByAccountId,
      ]
    );
    return result.rows[0];
  }

  async updateFulfillmentBatchStatus(input: {
    tenantId: string;
    branchId: string;
    batchId: string;
    status: V0OrderFulfillmentBatchStatus;
  }): Promise<V0OrderFulfillmentBatchRow | null> {
    const result = await this.db.query<V0OrderFulfillmentBatchRow>(
      `UPDATE v0_order_fulfillment_batches
       SET status = $4,
           completed_at = CASE WHEN $4 = 'COMPLETED' THEN NOW() ELSE completed_at END,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND branch_id = $2
         AND id = $3
       RETURNING ${FULFILLMENT_BATCH_SELECT}`,
      [input.tenantId, input.branchId, input.batchId, input.status]
    );
    return result.rows[0] ?? null;
  }

  async listFulfillmentBatchesByOrder(input: {
    tenantId: string;
    orderTicketId: string;
  }): Promise<V0OrderFulfillmentBatchRow[]> {
    const result = await this.db.query<V0OrderFulfillmentBatchRow>(
      `SELECT
         ${FULFILLMENT_BATCH_SELECT}
       FROM v0_order_fulfillment_batches
       WHERE tenant_id = $1
         AND order_ticket_id = $2
       ORDER BY created_at ASC, id ASC`,
      [input.tenantId, input.orderTicketId]
    );
    return result.rows;
  }
}
