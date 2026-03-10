import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type ReceiptSaleStatus = "FINALIZED" | "VOID_PENDING" | "VOIDED";
export type ReceiptPaymentMethod = "CASH" | "KHQR";
export type ReceiptTenderCurrency = "USD" | "KHR";

export type V0ReceiptDerivedSaleRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  status: ReceiptSaleStatus;
  payment_method: ReceiptPaymentMethod;
  tender_currency: ReceiptTenderCurrency;
  tender_amount: number;
  paid_amount: number;
  cash_received_tender_amount: number | null;
  cash_change_tender_amount: number;
  subtotal_usd: number;
  subtotal_khr: number;
  discount_usd: number;
  discount_khr: number;
  vat_usd: number;
  vat_khr: number;
  grand_total_usd: number;
  grand_total_khr: number;
  finalized_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type V0ReceiptDerivedSaleLineRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  sale_id: string;
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

const DERIVED_SALE_SELECT = `
  id,
  tenant_id,
  branch_id,
  status,
  payment_method,
  tender_currency,
  tender_amount::FLOAT8 AS tender_amount,
  paid_amount::FLOAT8 AS paid_amount,
  cash_received_tender_amount::FLOAT8 AS cash_received_tender_amount,
  cash_change_tender_amount::FLOAT8 AS cash_change_tender_amount,
  subtotal_usd::FLOAT8 AS subtotal_usd,
  subtotal_khr::FLOAT8 AS subtotal_khr,
  discount_usd::FLOAT8 AS discount_usd,
  discount_khr::FLOAT8 AS discount_khr,
  vat_usd::FLOAT8 AS vat_usd,
  vat_khr::FLOAT8 AS vat_khr,
  grand_total_usd::FLOAT8 AS grand_total_usd,
  grand_total_khr::FLOAT8 AS grand_total_khr,
  finalized_at,
  created_at,
  updated_at
`;

const DERIVED_SALE_LINE_SELECT = `
  id,
  tenant_id,
  branch_id,
  sale_id,
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

export class V0ReceiptRepository {
  constructor(private readonly db: Queryable) {}

  async getSaleForReceiptById(input: {
    tenantId: string;
    branchId: string;
    saleId: string;
  }): Promise<V0ReceiptDerivedSaleRow | null> {
    const result = await this.db.query<V0ReceiptDerivedSaleRow>(
      `SELECT
         ${DERIVED_SALE_SELECT}
       FROM v0_sales
       WHERE tenant_id = $1
         AND branch_id = $2
         AND id = $3
         AND status IN ('FINALIZED', 'VOID_PENDING', 'VOIDED')
       LIMIT 1`,
      [input.tenantId, input.branchId, input.saleId]
    );
    return result.rows[0] ?? null;
  }

  async listSaleLinesBySaleId(input: {
    tenantId: string;
    saleId: string;
  }): Promise<V0ReceiptDerivedSaleLineRow[]> {
    const result = await this.db.query<V0ReceiptDerivedSaleLineRow>(
      `SELECT
         ${DERIVED_SALE_LINE_SELECT}
       FROM v0_sale_lines
       WHERE tenant_id = $1
         AND sale_id = $2
       ORDER BY created_at ASC, id ASC`,
      [input.tenantId, input.saleId]
    );
    return result.rows;
  }
}
