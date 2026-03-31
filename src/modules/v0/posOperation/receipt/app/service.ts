import {
  type V0ReceiptDerivedSaleLineRow,
  type V0ReceiptDerivedSaleRow,
  type ReceiptPaymentMethod,
  type ReceiptTenderCurrency,
  V0ReceiptRepository,
} from "../infra/repository.js";
import { deriveSaleReceiptNumber } from "./reference.js";

type ActorContext = {
  accountId: string;
  tenantId: string | null;
  branchId: string | null;
};

type ReceiptStatusDisplay = "NORMAL" | "VOID_PENDING" | "VOIDED";

type ReceiptLineDto = {
  lineId: string;
  menuItemNameSnapshot: string;
  unitPrice: number;
  quantity: number;
  lineDiscountAmount: number;
  lineTotalAmount: number;
  modifierSnapshot: unknown;
};

type ReceiptDto = {
  receiptId: string;
  saleId: string;
  tenantId: string;
  branchId: string;
  receiptNumber: string;
  statusDisplay: ReceiptStatusDisplay;
  issuedAt: string;
  saleSnapshot: {
    paymentMethod: ReceiptPaymentMethod;
    tenderCurrency: ReceiptTenderCurrency;
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
  lines: ReceiptLineDto[];
  createdAt: string;
  updatedAt: string;
};

type PrintRequestDto = {
  receiptId: string;
  requestedAt: string;
  purpose: "AUTO_AFTER_FINALIZE" | "MANUAL_REPRINT";
  dispatchStatus: "QUEUED";
};

export class V0ReceiptError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code?: string
  ) {
    super(message);
    this.name = "V0ReceiptError";
  }
}

export class V0ReceiptService {
  constructor(private readonly repo: V0ReceiptRepository) {}

  async getReceiptById(input: {
    actor: ActorContext;
    receiptId: string;
  }): Promise<ReceiptDto> {
    const actor = assertBranchContext(input.actor);
    const receiptId = parseRequiredUuid(input.receiptId, "receiptId");
    const sale = await this.repo.getSaleForReceiptById({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      saleId: receiptId,
    });
    if (!sale) {
      throw new V0ReceiptError(404, "receipt not found", "RECEIPT_NOT_FOUND");
    }
    return this.mapDerivedReceipt(actor.tenantId, sale);
  }

  async getReceiptBySaleId(input: {
    actor: ActorContext;
    saleId: string;
  }): Promise<ReceiptDto> {
    const actor = assertBranchContext(input.actor);
    const saleId = parseRequiredUuid(input.saleId, "saleId");
    const sale = await this.repo.getSaleForReceiptById({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      saleId,
    });
    if (!sale) {
      throw new V0ReceiptError(404, "receipt not found", "RECEIPT_NOT_FOUND");
    }
    return this.mapDerivedReceipt(actor.tenantId, sale);
  }

  async requestPrint(input: {
    actor: ActorContext;
    receiptId: string;
    body: unknown;
  }): Promise<PrintRequestDto> {
    const actor = assertBranchContext(input.actor);
    const receiptId = parseRequiredUuid(input.receiptId, "receiptId");
    await this.assertReceiptExists({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      receiptId,
    });
    parsePrintBody(input.body, { allowReason: false });

    return {
      receiptId,
      requestedAt: new Date().toISOString(),
      purpose: "AUTO_AFTER_FINALIZE",
      dispatchStatus: "QUEUED",
    };
  }

  async requestReprint(input: {
    actor: ActorContext;
    receiptId: string;
    body: unknown;
  }): Promise<PrintRequestDto> {
    const actor = assertBranchContext(input.actor);
    const receiptId = parseRequiredUuid(input.receiptId, "receiptId");
    await this.assertReceiptExists({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      receiptId,
    });
    parsePrintBody(input.body, { allowReason: true });

    return {
      receiptId,
      requestedAt: new Date().toISOString(),
      purpose: "MANUAL_REPRINT",
      dispatchStatus: "QUEUED",
    };
  }

  private async assertReceiptExists(input: {
    tenantId: string;
    branchId: string;
    receiptId: string;
  }): Promise<void> {
    const sale = await this.repo.getSaleForReceiptById({
      tenantId: input.tenantId,
      branchId: input.branchId,
      saleId: input.receiptId,
    });
    if (!sale) {
      throw new V0ReceiptError(404, "receipt not found", "RECEIPT_NOT_FOUND");
    }
  }

  private async mapDerivedReceipt(
    tenantId: string,
    sale: V0ReceiptDerivedSaleRow
  ): Promise<ReceiptDto> {
    const lines = await this.repo.listSaleLinesBySaleId({
      tenantId,
      saleId: sale.id,
    });
    const issuedAt = sale.finalized_at ?? sale.updated_at ?? sale.created_at;
    return {
      receiptId: sale.id,
      saleId: sale.id,
      tenantId: sale.tenant_id,
      branchId: sale.branch_id,
      receiptNumber: deriveSaleReceiptNumber({
        finalizedAt: sale.finalized_at,
        updatedAt: sale.updated_at,
        createdAt: sale.created_at,
      }),
      statusDisplay: mapStatusDisplay(sale.status),
      issuedAt: issuedAt.toISOString(),
      saleSnapshot: {
        paymentMethod: sale.payment_method,
        tenderCurrency: sale.tender_currency,
        tenderAmount: sale.tender_amount,
        paidAmount: sale.paid_amount,
        cashReceivedTenderAmount: sale.cash_received_tender_amount,
        cashChangeTenderAmount: sale.cash_change_tender_amount,
        subtotalUsd: sale.subtotal_usd,
        subtotalKhr: sale.subtotal_khr,
        discountUsd: sale.discount_usd,
        discountKhr: sale.discount_khr,
        vatUsd: sale.vat_usd,
        vatKhr: sale.vat_khr,
        grandTotalUsd: sale.grand_total_usd,
        grandTotalKhr: sale.grand_total_khr,
      },
      lines: lines.map(mapDerivedSaleLine),
      createdAt: sale.created_at.toISOString(),
      updatedAt: sale.updated_at.toISOString(),
    };
  }
}

function assertBranchContext(actor: ActorContext): {
  accountId: string;
  tenantId: string;
  branchId: string;
} {
  const accountId = normalizeRequiredString(actor.accountId, 401, "INVALID_ACCESS_TOKEN");
  const tenantId = normalizeRequiredString(actor.tenantId, 403, "TENANT_CONTEXT_REQUIRED");
  const branchId = normalizeRequiredString(actor.branchId, 403, "BRANCH_CONTEXT_REQUIRED");
  return { accountId, tenantId, branchId };
}

function normalizeRequiredString(
  value: string | null | undefined,
  statusCode: number,
  code: string
): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new V0ReceiptError(statusCode, code, code);
  }
  return normalized;
}

function parseRequiredUuid(value: unknown, field: string): string {
  const normalized = String(value ?? "").trim();
  if (!isUuid(normalized)) {
    throw new V0ReceiptError(422, `${field} must be a valid UUID`);
  }
  return normalized;
}

function parsePrintBody(
  body: unknown,
  options: {
    allowReason: boolean;
  }
): void {
  const payload = toObject(body);
  if (Object.prototype.hasOwnProperty.call(payload, "copies")) {
    const copies = Number(payload.copies);
    if (!Number.isInteger(copies) || copies < 1 || copies > 10) {
      throw new V0ReceiptError(422, "copies must be an integer between 1 and 10");
    }
  }
  if (Object.prototype.hasOwnProperty.call(payload, "target")) {
    const target = String(payload.target ?? "").trim();
    if (!target) {
      throw new V0ReceiptError(422, "target must be a non-empty string");
    }
  }
  if (!options.allowReason && Object.prototype.hasOwnProperty.call(payload, "reason")) {
    throw new V0ReceiptError(422, "reason is only allowed for reprint");
  }
  if (options.allowReason && Object.prototype.hasOwnProperty.call(payload, "reason")) {
    const reason = String(payload.reason ?? "").trim();
    if (!reason) {
      throw new V0ReceiptError(422, "reason must be a non-empty string");
    }
  }
}

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function mapStatusDisplay(
  status: V0ReceiptDerivedSaleRow["status"]
): ReceiptStatusDisplay {
  if (status === "FINALIZED") {
    return "NORMAL";
  }
  return status;
}

function mapDerivedSaleLine(line: V0ReceiptDerivedSaleLineRow): ReceiptLineDto {
  return {
    lineId: line.id,
    menuItemNameSnapshot: line.menu_item_name_snapshot,
    unitPrice: line.unit_price,
    quantity: line.quantity,
    lineDiscountAmount: line.line_discount_amount,
    lineTotalAmount: line.line_total_amount,
    modifierSnapshot: line.modifier_snapshot ?? [],
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
