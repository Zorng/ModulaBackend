import type {
  V0SaleLineRow,
  V0SaleRow,
} from "../../saleOrder/infra/repository.js";

export type V0SaleReceiptPreview = {
  receiptId: string;
  saleId: string;
  statusDisplay: "NORMAL" | "VOID_PENDING" | "VOIDED";
  issuedAt: string;
  saleSnapshot: {
    paymentMethod: "CASH" | "KHQR";
    tenderCurrency: "USD" | "KHR";
    tenderAmount: number;
    paidAmount: number;
    cashReceivedTenderAmount: number | null;
    cashChangeTenderAmount: number;
    subtotalUsd: number;
    subtotalKhr: number;
    discountUsd: number;
    discountKhr: number;
    vatUsd: number;
    vatKhr: number;
    grandTotalUsd: number;
    grandTotalKhr: number;
  };
  lines: Array<{
    lineId: string;
    menuItemId: string;
    menuItemNameSnapshot: string;
    unitPrice: number;
    quantity: number;
    lineDiscountAmount: number;
    lineTotalAmount: number;
    modifierSnapshot: unknown;
  }>;
};

export function buildSaleReceiptPreview(input: {
  sale: V0SaleRow;
  lines: readonly V0SaleLineRow[];
}): V0SaleReceiptPreview {
  const issuedAt = input.sale.finalized_at ?? input.sale.updated_at ?? input.sale.created_at;

  return {
    receiptId: input.sale.id,
    saleId: input.sale.id,
    statusDisplay: mapStatusDisplay(input.sale.status),
    issuedAt: issuedAt.toISOString(),
    saleSnapshot: {
      paymentMethod: input.sale.payment_method,
      tenderCurrency: input.sale.tender_currency,
      tenderAmount: input.sale.tender_amount,
      paidAmount: input.sale.paid_amount,
      cashReceivedTenderAmount: input.sale.cash_received_tender_amount,
      cashChangeTenderAmount: input.sale.cash_change_tender_amount,
      subtotalUsd: input.sale.subtotal_usd,
      subtotalKhr: input.sale.subtotal_khr,
      discountUsd: input.sale.discount_usd,
      discountKhr: input.sale.discount_khr,
      vatUsd: input.sale.vat_usd,
      vatKhr: input.sale.vat_khr,
      grandTotalUsd: input.sale.grand_total_usd,
      grandTotalKhr: input.sale.grand_total_khr,
    },
    lines: input.lines.map((line) => ({
      lineId: line.id,
      menuItemId: line.menu_item_id,
      menuItemNameSnapshot: line.menu_item_name_snapshot,
      unitPrice: line.unit_price,
      quantity: line.quantity,
      lineDiscountAmount: line.line_discount_amount,
      lineTotalAmount: line.line_total_amount,
      modifierSnapshot: line.modifier_snapshot ?? [],
    })),
  };
}

function mapStatusDisplay(status: string): "NORMAL" | "VOID_PENDING" | "VOIDED" {
  if (status === "VOID_PENDING") {
    return "VOID_PENDING";
  }
  if (status === "VOIDED") {
    return "VOIDED";
  }
  return "NORMAL";
}
