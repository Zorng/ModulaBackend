import { normalizeOptionalString } from "../../../../../shared/utils/string.js";
import {
  type V0OrderMenuItemRow,
  type V0OrderMenuModifierGroupRow,
  type V0OrderMenuModifierOptionRow,
  V0SaleOrderRepository,
  type V0OrderFulfillmentBatchRow,
  type V0OrderFulfillmentBatchStatus,
  type V0OrderTicketLineRow,
  type V0OrderTicketRow,
  type V0OrderTicketStatus,
  type V0SaleLineRow,
  type V0SalePaymentMethod,
  type V0SaleRow,
  type V0SaleStatus,
  type V0SaleType,
  type V0TenderCurrency,
  type V0VoidRequestRow,
} from "../infra/repository.js";

type ActorContext = {
  accountId: string;
  tenantId: string | null;
  branchId: string | null;
};

type ItemInput = {
  menuItemId: string;
  menuItemNameSnapshot: string;
  unitPrice: number;
  quantity: number;
  modifierSnapshot: unknown;
  note: string | null;
};

type CheckoutPreparation = {
  actor: { accountId: string; tenantId: string; branchId: string };
  body: Record<string, unknown>;
  items: ItemInput[];
  checkout: CheckoutInput;
};

type ModifierSelectionInput = {
  groupId: string;
  optionIds: string[];
};

type ItemDraft = {
  menuItemId: string;
  quantity: number;
  modifierSelections: ModifierSelectionInput[];
  note: string | null;
};

type CheckoutInput = {
  paymentMethod: V0SalePaymentMethod;
  saleType: V0SaleType;
  tenderCurrency: V0TenderCurrency;
  tenderAmount: number;
  cashReceivedTenderAmount: number | null;
  cashChangeTenderAmount: number;
  khqrMd5: string | null;
  khqrToAccountId: string | null;
  khqrHash: string | null;
  khqrConfirmedAt: Date | null;
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
  paidAmount: number;
};

type SaleFinalizeInput = {
  paidAmount: number;
  tenderAmount: number | null;
  cashReceivedTenderAmount: number | null;
  cashChangeTenderAmount: number | null;
  khqrMd5: string | null;
  khqrHash: string | null;
  khqrConfirmedAt: Date | null;
};

export class V0SaleOrderError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code?: string
  ) {
    super(message);
    this.name = "V0SaleOrderError";
  }
}

export class V0SaleOrderService {
  constructor(private readonly repo: V0SaleOrderRepository) {}

  async listOrders(input: {
    actor: ActorContext;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<Array<Record<string, unknown>>> {
    const actor = assertBranchContext(input.actor);
    const status = parseOrderStatusFilter(input.status);
    const rows = await this.repo.listOrderTickets({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      status,
      limit: normalizeLimit(input.limit),
      offset: normalizeOffset(input.offset),
    });
    return rows.map(mapOrderTicketSummary);
  }

  async getOrder(input: {
    actor: ActorContext;
    orderId: string;
  }): Promise<Record<string, unknown>> {
    const actor = assertBranchContext(input.actor);
    const orderId = requireUuid(input.orderId, "orderId");
    const order = await this.repo.getOrderTicketById({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      orderTicketId: orderId,
    });
    if (!order) {
      throw new V0SaleOrderError(404, "order not found", "ORDER_NOT_FOUND");
    }
    const lines = await this.repo.listOrderTicketLines({
      tenantId: actor.tenantId,
      orderTicketId: order.id,
    });
    const fulfillmentBatches = await this.repo.listFulfillmentBatchesByOrder({
      tenantId: actor.tenantId,
      orderTicketId: order.id,
    });

    return {
      ...mapOrderTicket(order),
      lines: lines.map(mapOrderTicketLine),
      fulfillmentBatches: fulfillmentBatches.map(mapFulfillmentBatch),
    };
  }

  async placeOrder(input: {
    actor: ActorContext;
    body: unknown;
  }): Promise<Record<string, unknown>> {
    const actor = assertBranchContext(input.actor);
    await this.requirePayLaterEnabled(actor);
    await this.requireOpenCashSession(actor, "ORDER_REQUIRES_OPEN_CASH_SESSION");
    const body = toRecord(input.body);
    const itemDrafts = parseOrderItems(body.items, false);
    const items = await this.hydrateOrderItems({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      itemDrafts,
    });

    const order = await this.repo.createOrderTicket({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      openedByAccountId: actor.accountId,
    });

    const lines: V0OrderTicketLineRow[] = [];
    for (const item of items) {
      const created = await this.repo.createOrderTicketLine({
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        orderTicketId: order.id,
        menuItemId: item.menuItemId,
        menuItemNameSnapshot: item.menuItemNameSnapshot,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        lineSubtotal: roundMoney(item.unitPrice * item.quantity),
        modifierSnapshot: item.modifierSnapshot,
        note: item.note,
      });
      lines.push(created);
    }

    const payload: Record<string, unknown> = {
      ...mapOrderTicket(order),
      lines: lines.map(mapOrderTicketLine),
    };
    return payload;
  }

  async addOrderItems(input: {
    actor: ActorContext;
    orderId: string;
    body: unknown;
  }): Promise<Record<string, unknown>> {
    const actor = assertBranchContext(input.actor);
    await this.requirePayLaterEnabled(actor);
    const orderId = requireUuid(input.orderId, "orderId");
    const order = await this.repo.getOrderTicketById({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      orderTicketId: orderId,
    });
    if (!order) {
      throw new V0SaleOrderError(404, "order not found", "ORDER_NOT_FOUND");
    }
    if (order.status !== "OPEN") {
      throw new V0SaleOrderError(409, "order is not open", "ORDER_NOT_UNPAID");
    }
    await this.requireOpenCashSession(actor, "ORDER_REQUIRES_OPEN_CASH_SESSION");

    const body = toRecord(input.body);
    const itemDrafts = parseOrderItems(body.items, true);
    const items = await this.hydrateOrderItems({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      itemDrafts,
    });
    const createdLines: V0OrderTicketLineRow[] = [];
    for (const item of items) {
      const created = await this.repo.createOrderTicketLine({
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        orderTicketId: order.id,
        menuItemId: item.menuItemId,
        menuItemNameSnapshot: item.menuItemNameSnapshot,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        lineSubtotal: roundMoney(item.unitPrice * item.quantity),
        modifierSnapshot: item.modifierSnapshot,
        note: item.note,
      });
      createdLines.push(created);
    }

    return {
      id: order.id,
      status: order.status,
      addedLines: createdLines.map(mapOrderTicketLine),
    };
  }

  async cancelOrder(input: {
    actor: ActorContext;
    orderId: string;
    body: unknown;
  }): Promise<Record<string, unknown>> {
    const actor = assertBranchContext(input.actor);
    const orderId = requireUuid(input.orderId, "orderId");
    const order = await this.repo.getOrderTicketById({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      orderTicketId: orderId,
    });
    if (!order) {
      throw new V0SaleOrderError(404, "order not found", "ORDER_NOT_FOUND");
    }
    if (order.status === "CANCELLED") {
      const existingBatches = await this.repo.listFulfillmentBatchesByOrder({
        tenantId: actor.tenantId,
        orderTicketId: order.id,
      });
      return {
        ...mapOrderTicket(order),
        fulfillmentBatches: existingBatches.map(mapFulfillmentBatch),
      };
    }
    if (order.status !== "OPEN") {
      throw new V0SaleOrderError(
        409,
        "only open unpaid order can be cancelled",
        "ORDER_CANCEL_NOT_ALLOWED"
      );
    }

    const body = toRecord(input.body);
    const reason = normalizeOptionalString(body.reason);
    if (!reason) {
      throw new V0SaleOrderError(
        422,
        "cancel reason is required",
        "ORDER_CANCEL_REASON_REQUIRED"
      );
    }

    const cancelled = await this.repo.cancelOrderTicket({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      orderTicketId: order.id,
      cancelledByAccountId: actor.accountId,
      cancelReason: reason,
    });
    if (!cancelled) {
      throw new V0SaleOrderError(
        409,
        "order is not cancelable",
        "ORDER_CANCEL_NOT_ALLOWED"
      );
    }
    await this.repo.cancelFulfillmentBatchesByOrder({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      orderTicketId: order.id,
    });
    const batches = await this.repo.listFulfillmentBatchesByOrder({
      tenantId: actor.tenantId,
      orderTicketId: order.id,
    });

    return {
      ...mapOrderTicket(cancelled),
      fulfillmentBatches: batches.map(mapFulfillmentBatch),
    };
  }

  async checkoutOrder(input: {
    actor: ActorContext;
    orderId: string;
    body: unknown;
  }): Promise<Record<string, unknown>> {
    const actor = assertBranchContext(input.actor);
    const orderId = requireUuid(input.orderId, "orderId");
    const order = await this.repo.getOrderTicketById({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      orderTicketId: orderId,
    });
    if (!order) {
      throw new V0SaleOrderError(404, "order not found", "ORDER_NOT_FOUND");
    }
    if (order.status !== "OPEN") {
      throw new V0SaleOrderError(409, "order is not open", "ORDER_NOT_UNPAID");
    }

    const existingSale = await this.repo.getSaleByOrderTicketId({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      orderTicketId: order.id,
    });
    if (existingSale) {
      throw new V0SaleOrderError(409, "order already checked out", "ORDER_NOT_UNPAID");
    }

    const lines = await this.repo.listOrderTicketLines({
      tenantId: actor.tenantId,
      orderTicketId: order.id,
    });
    if (lines.length === 0) {
      throw new V0SaleOrderError(422, "order has no items", "ORDER_NO_ITEMS");
    }
    await this.requireOpenCashSession(actor, "SALE_CHECKOUT_REQUIRES_OPEN_CASH_SESSION");

    const body = toRecord(input.body);
    const checkout = parseCheckoutBody(body, lines);

    const sale = await this.repo.createSale({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      orderTicketId: order.id,
      saleType: checkout.saleType,
      paymentMethod: checkout.paymentMethod,
      tenderCurrency: checkout.tenderCurrency,
      tenderAmount: checkout.tenderAmount,
      cashReceivedTenderAmount: checkout.cashReceivedTenderAmount,
      cashChangeTenderAmount: checkout.cashChangeTenderAmount,
      khqrMd5: checkout.khqrMd5,
      khqrToAccountId: checkout.khqrToAccountId,
      khqrHash: checkout.khqrHash,
      khqrConfirmedAt: checkout.khqrConfirmedAt,
      subtotalUsd: checkout.subtotalUsd,
      subtotalKhr: checkout.subtotalKhr,
      discountUsd: checkout.discountUsd,
      discountKhr: checkout.discountKhr,
      vatUsd: checkout.vatUsd,
      vatKhr: checkout.vatKhr,
      grandTotalUsd: checkout.grandTotalUsd,
      grandTotalKhr: checkout.grandTotalKhr,
      saleFxRateKhrPerUsd: checkout.saleFxRateKhrPerUsd,
      saleKhrRoundingEnabled: checkout.saleKhrRoundingEnabled,
      saleKhrRoundingMode: checkout.saleKhrRoundingMode,
      saleKhrRoundingGranularity: checkout.saleKhrRoundingGranularity,
      paidAmount: checkout.paidAmount,
    });

    const saleLines: V0SaleLineRow[] = [];
    for (const line of lines) {
      const saleLine = await this.repo.createSaleLine({
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        saleId: sale.id,
        orderTicketLineId: line.id,
        menuItemId: line.menu_item_id,
        menuItemNameSnapshot: line.menu_item_name_snapshot,
        unitPrice: line.unit_price,
        quantity: line.quantity,
        lineDiscountAmount: 0,
        lineTotalAmount: line.line_subtotal,
        modifierSnapshot: line.modifier_snapshot,
      });
      saleLines.push(saleLine);
    }

    const checkedOutOrder = await this.repo.markOrderTicketCheckedOut({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      orderTicketId: order.id,
      checkedOutByAccountId: actor.accountId,
    });
    if (!checkedOutOrder) {
      throw new V0SaleOrderError(409, "order checkout failed", "ORDER_NOT_UNPAID");
    }

    let saleForResponse = sale;
    if (checkout.paymentMethod === "CASH") {
      const finalized = await this.repo.markSaleFinalized({
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        saleId: sale.id,
        finalizedByAccountId: actor.accountId,
        paidAmount: checkout.paidAmount,
        tenderAmount: checkout.tenderAmount,
        cashReceivedTenderAmount: checkout.cashReceivedTenderAmount,
        cashChangeTenderAmount: checkout.cashChangeTenderAmount,
        khqrHash: null,
        khqrConfirmedAt: null,
      });
      if (!finalized) {
        throw new V0SaleOrderError(409, "sale finalize failed", "SALE_NOT_FOUND");
      }
      saleForResponse = finalized;
    }

    return {
      ...mapSale(saleForResponse),
      order: mapOrderTicket(checkedOutOrder),
      lines: saleLines.map(mapSaleLine),
    };
  }

  async updateFulfillmentStatus(input: {
    actor: ActorContext;
    orderId: string;
    body: unknown;
  }): Promise<Record<string, unknown>> {
    const actor = assertBranchContext(input.actor);
    const orderId = requireUuid(input.orderId, "orderId");
    const order = await this.repo.getOrderTicketById({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      orderTicketId: orderId,
    });
    if (!order) {
      throw new V0SaleOrderError(404, "order not found", "ORDER_NOT_FOUND");
    }

    const body = toRecord(input.body);
    const status = parseFulfillmentStatus(body.status);
    const note = normalizeOptionalString(body.note);

    const batch = await this.repo.createFulfillmentBatch({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      orderTicketId: order.id,
      status,
      note: note ?? null,
      createdByAccountId: actor.accountId,
    });

    return mapFulfillmentBatch(batch);
  }

  async listSales(input: {
    actor: ActorContext;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<Array<Record<string, unknown>>> {
    const actor = assertBranchContext(input.actor);
    const status = parseSaleStatusFilter(input.status);
    const rows = await this.repo.listSales({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      status,
      limit: normalizeLimit(input.limit),
      offset: normalizeOffset(input.offset),
    });
    return rows.map(mapSaleSummary);
  }

  async getSale(input: {
    actor: ActorContext;
    saleId: string;
  }): Promise<Record<string, unknown>> {
    const actor = assertBranchContext(input.actor);
    const saleId = requireUuid(input.saleId, "saleId");
    const sale = await this.repo.getSaleById({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      saleId,
    });
    if (!sale) {
      throw new V0SaleOrderError(404, "sale not found", "SALE_NOT_FOUND");
    }
    const lines = await this.repo.listSaleLines({
      tenantId: actor.tenantId,
      saleId: sale.id,
    });
    return {
      ...mapSale(sale),
      lines: lines.map(mapSaleLine),
    };
  }

  async finalizeSale(input: {
    actor: ActorContext;
    saleId: string;
    body: unknown;
  }): Promise<Record<string, unknown>> {
    const actor = assertBranchContext(input.actor);
    const saleId = requireUuid(input.saleId, "saleId");
    const sale = await this.repo.getSaleById({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      saleId,
    });
    if (!sale) {
      throw new V0SaleOrderError(404, "sale not found", "SALE_NOT_FOUND");
    }
    if (sale.status === "VOIDED") {
      throw new V0SaleOrderError(409, "sale already voided", "SALE_ALREADY_VOIDED");
    }
    if (sale.status === "FINALIZED") {
      return mapSale(sale);
    }

    const hasOpenSession = await this.repo.hasOpenCashSession({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
    });
    if (!hasOpenSession) {
      throw new V0SaleOrderError(
        422,
        "open cash session required to finalize sale",
        "SALE_FINALIZE_REQUIRES_OPEN_CASH_SESSION"
      );
    }

    const body = toRecord(input.body);
    const finalizePayload = parseFinalizeBody(body, sale);

    if (sale.payment_method === "KHQR") {
      if (!finalizePayload.khqrMd5 && !sale.khqr_md5) {
        throw new V0SaleOrderError(
          422,
          "khqr confirmation required before finalize",
          "SALE_FINALIZE_KHQR_CONFIRMATION_REQUIRED"
        );
      }
    }

    const finalized = await this.repo.markSaleFinalized({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      saleId: sale.id,
      finalizedByAccountId: actor.accountId,
      paidAmount: finalizePayload.paidAmount,
      tenderAmount: finalizePayload.tenderAmount ?? undefined,
      cashReceivedTenderAmount: finalizePayload.cashReceivedTenderAmount ?? undefined,
      cashChangeTenderAmount: finalizePayload.cashChangeTenderAmount ?? undefined,
      khqrHash: finalizePayload.khqrHash,
      khqrConfirmedAt: finalizePayload.khqrConfirmedAt,
    });
    if (!finalized) {
      throw new V0SaleOrderError(409, "sale finalize failed", "SALE_NOT_FOUND");
    }
    return mapSale(finalized);
  }

  async requestVoid(input: {
    actor: ActorContext;
    saleId: string;
    body: unknown;
  }): Promise<Record<string, unknown>> {
    const actor = assertBranchContext(input.actor);
    const sale = await this.requireSale(actor, input.saleId);
    if (sale.status === "VOIDED") {
      throw new V0SaleOrderError(409, "sale already voided", "SALE_ALREADY_VOIDED");
    }
    if (sale.payment_method === "KHQR") {
      throw new V0SaleOrderError(
        422,
        "void not allowed for payment method",
        "VOID_NOT_ALLOWED_FOR_PAYMENT_METHOD"
      );
    }
    if (sale.status !== "FINALIZED") {
      throw new V0SaleOrderError(
        422,
        "void request requires a finalized sale",
        "VOID_NOT_ALLOWED_FOR_STATUS"
      );
    }

    if (!(await this.isWorkforceEnabled(actor))) {
      throw new V0SaleOrderError(
        422,
        "void approval not required in solo mode",
        "VOID_APPROVAL_NOT_REQUIRED"
      );
    }

    const pending = await this.repo.getPendingVoidRequestBySale({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      saleId: sale.id,
    });
    if (pending) {
      return mapVoidRequest(pending);
    }

    const body = toRecord(input.body);
    const reason = requireNonEmptyString(body.reason, "reason");
    const created = await this.repo.createVoidRequest({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      saleId: sale.id,
      requestedByAccountId: actor.accountId,
      status: "PENDING",
      reason,
    });
    return mapVoidRequest(created);
  }

  async approveVoid(input: {
    actor: ActorContext;
    saleId: string;
    body: unknown;
  }): Promise<Record<string, unknown>> {
    const actor = assertBranchContext(input.actor);
    const sale = await this.requireSale(actor, input.saleId);
    const pending = await this.repo.getPendingVoidRequestBySale({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      saleId: sale.id,
    });
    if (!pending) {
      const latest = await this.repo.getLatestVoidRequestBySale({
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        saleId: sale.id,
      });
      if (latest) {
        throw new V0SaleOrderError(
          409,
          "void request already resolved",
          "VOID_REQUEST_ALREADY_RESOLVED"
        );
      }
      throw new V0SaleOrderError(404, "void request not found", "VOID_REQUEST_NOT_FOUND");
    }

    const body = toRecord(input.body);
    const reviewNote = normalizeOptionalString(body.note);
    const resolved = await this.repo.resolveVoidRequest({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      voidRequestId: pending.id,
      reviewedByAccountId: actor.accountId,
      status: "APPROVED",
      reviewNote,
    });
    if (!resolved) {
      throw new V0SaleOrderError(409, "void request already resolved", "VOID_REQUEST_ALREADY_RESOLVED");
    }
    return mapVoidRequest(resolved);
  }

  async rejectVoid(input: {
    actor: ActorContext;
    saleId: string;
    body: unknown;
  }): Promise<Record<string, unknown>> {
    const actor = assertBranchContext(input.actor);
    const sale = await this.requireSale(actor, input.saleId);
    const pending = await this.repo.getPendingVoidRequestBySale({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      saleId: sale.id,
    });
    if (!pending) {
      const latest = await this.repo.getLatestVoidRequestBySale({
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        saleId: sale.id,
      });
      if (latest) {
        throw new V0SaleOrderError(
          409,
          "void request already resolved",
          "VOID_REQUEST_ALREADY_RESOLVED"
        );
      }
      throw new V0SaleOrderError(404, "void request not found", "VOID_REQUEST_NOT_FOUND");
    }

    const body = toRecord(input.body);
    const reviewNote = normalizeOptionalString(body.note);
    const resolved = await this.repo.resolveVoidRequest({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      voidRequestId: pending.id,
      reviewedByAccountId: actor.accountId,
      status: "REJECTED",
      reviewNote,
    });
    if (!resolved) {
      throw new V0SaleOrderError(409, "void request already resolved", "VOID_REQUEST_ALREADY_RESOLVED");
    }
    return mapVoidRequest(resolved);
  }

  async executeVoid(input: {
    actor: ActorContext;
    saleId: string;
    body: unknown;
  }): Promise<Record<string, unknown>> {
    const actor = assertBranchContext(input.actor);
    const sale = await this.requireSale(actor, input.saleId);
    if (sale.status === "VOIDED") {
      throw new V0SaleOrderError(409, "sale already voided", "SALE_ALREADY_VOIDED");
    }
    if (sale.payment_method === "KHQR") {
      throw new V0SaleOrderError(
        422,
        "void not allowed for payment method",
        "VOID_NOT_ALLOWED_FOR_PAYMENT_METHOD"
      );
    }
    if (sale.status !== "FINALIZED" && sale.status !== "VOID_PENDING") {
      throw new V0SaleOrderError(
        422,
        "void execution requires a finalized sale",
        "VOID_NOT_ALLOWED_FOR_STATUS"
      );
    }

    const workforceEnabled = await this.isWorkforceEnabled(actor);
    const latestRequest = await this.repo.getLatestVoidRequestBySale({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      saleId: sale.id,
    });
    if (workforceEnabled && latestRequest?.status !== "APPROVED") {
      throw new V0SaleOrderError(
        422,
        "void approval required",
        "VOID_APPROVAL_REQUIRED"
      );
    }

    if (!workforceEnabled && !latestRequest) {
      const body = toRecord(input.body);
      const reason = normalizeOptionalString(body.reason) ?? "Direct void";
      await this.repo.createVoidRequest({
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        saleId: sale.id,
        requestedByAccountId: actor.accountId,
        status: "APPROVED",
        reason,
        reviewedByAccountId: actor.accountId,
        reviewedAt: new Date(),
        reviewNote: "auto-approved in solo mode",
      });
    }

    const pendingMarked = await this.repo.markSaleVoidPending({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      saleId: sale.id,
    });
    if (!pendingMarked) {
      throw new V0SaleOrderError(409, "sale is not voidable in current state", "SALE_VOID_STATE_CONFLICT");
    }
    const body = toRecord(input.body);
    const voidReason =
      normalizeOptionalString(body.reason)
      ?? latestRequest?.reason
      ?? sale.void_reason
      ?? "Void executed";
    const voided = await this.repo.markSaleVoided({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      saleId: sale.id,
      voidedByAccountId: actor.accountId,
      voidReason,
    });
    if (!voided) {
      throw new V0SaleOrderError(409, "sale already voided", "SALE_ALREADY_VOIDED");
    }
    return mapSale(voided);
  }

  async getVoidRequest(input: {
    actor: ActorContext;
    saleId: string;
  }): Promise<Record<string, unknown>> {
    const actor = assertBranchContext(input.actor);
    const sale = await this.requireSale(actor, input.saleId);
    const latest = await this.repo.getLatestVoidRequestBySale({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      saleId: sale.id,
    });
    if (!latest) {
      throw new V0SaleOrderError(404, "void request not found", "VOID_REQUEST_NOT_FOUND");
    }
    return mapVoidRequest(latest);
  }

  async cashFinalizeFromLocalCart(input: {
    actor: ActorContext;
    body: unknown;
  }): Promise<Record<string, unknown>> {
    const prepared = await this.prepareCheckoutFromLocalCart({
      actor: input.actor,
      body: input.body,
      forcedPaymentMethod: "CASH",
    });

    const sale = await this.repo.createSale({
      tenantId: prepared.actor.tenantId,
      branchId: prepared.actor.branchId,
      orderTicketId: null,
      saleType: prepared.checkout.saleType,
      paymentMethod: "CASH",
      tenderCurrency: prepared.checkout.tenderCurrency,
      tenderAmount: prepared.checkout.tenderAmount,
      cashReceivedTenderAmount: prepared.checkout.cashReceivedTenderAmount,
      cashChangeTenderAmount: prepared.checkout.cashChangeTenderAmount,
      khqrMd5: null,
      khqrToAccountId: null,
      khqrHash: null,
      khqrConfirmedAt: null,
      subtotalUsd: prepared.checkout.subtotalUsd,
      subtotalKhr: prepared.checkout.subtotalKhr,
      discountUsd: prepared.checkout.discountUsd,
      discountKhr: prepared.checkout.discountKhr,
      vatUsd: prepared.checkout.vatUsd,
      vatKhr: prepared.checkout.vatKhr,
      grandTotalUsd: prepared.checkout.grandTotalUsd,
      grandTotalKhr: prepared.checkout.grandTotalKhr,
      saleFxRateKhrPerUsd: prepared.checkout.saleFxRateKhrPerUsd,
      saleKhrRoundingEnabled: prepared.checkout.saleKhrRoundingEnabled,
      saleKhrRoundingMode: prepared.checkout.saleKhrRoundingMode,
      saleKhrRoundingGranularity: prepared.checkout.saleKhrRoundingGranularity,
      paidAmount: prepared.checkout.paidAmount,
    });

    const saleLines: V0SaleLineRow[] = [];
    for (const item of prepared.items) {
      const lineSubtotal = roundMoney(item.unitPrice * item.quantity);
      const saleLine = await this.repo.createSaleLine({
        tenantId: prepared.actor.tenantId,
        branchId: prepared.actor.branchId,
        saleId: sale.id,
        orderTicketLineId: null,
        menuItemId: item.menuItemId,
        menuItemNameSnapshot: item.menuItemNameSnapshot,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        lineDiscountAmount: 0,
        lineTotalAmount: lineSubtotal,
        modifierSnapshot: item.modifierSnapshot,
      });
      saleLines.push(saleLine);
    }

    const finalized = await this.repo.markSaleFinalized({
      tenantId: prepared.actor.tenantId,
      branchId: prepared.actor.branchId,
      saleId: sale.id,
      finalizedByAccountId: prepared.actor.accountId,
      paidAmount: prepared.checkout.paidAmount,
      tenderAmount: prepared.checkout.tenderAmount,
      cashReceivedTenderAmount: prepared.checkout.cashReceivedTenderAmount,
      cashChangeTenderAmount: prepared.checkout.cashChangeTenderAmount,
      khqrHash: null,
      khqrConfirmedAt: null,
    });
    if (!finalized) {
      throw new V0SaleOrderError(409, "sale finalize failed", "SALE_NOT_FOUND");
    }

    return {
      ...mapSale(finalized),
      lines: saleLines.map(mapSaleLine),
    };
  }

  async prepareKhqrCheckoutIntent(input: {
    actor: ActorContext;
    body: unknown;
  }): Promise<{
    tenderAmount: number;
    tenderCurrency: V0TenderCurrency;
    expiresInSeconds: number | null;
    checkoutLinesSnapshot: unknown;
    checkoutTotalsSnapshot: unknown;
    pricingSnapshot: unknown;
    metadataSnapshot: unknown;
    preview: {
      itemCount: number;
      grandTotalUsd: number;
      grandTotalKhr: number;
    };
  }> {
    const prepared = await this.prepareCheckoutFromLocalCart({
      actor: input.actor,
      body: input.body,
      forcedPaymentMethod: "KHQR",
    });

    const checkoutLinesSnapshot = prepared.items.map((item) => {
      const lineSubtotal = roundMoney(item.unitPrice * item.quantity);
      return {
        menuItemId: item.menuItemId,
        menuItemNameSnapshot: item.menuItemNameSnapshot,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        lineSubtotal,
        lineDiscountAmount: 0,
        lineTotalAmount: lineSubtotal,
        modifierSnapshot: item.modifierSnapshot,
        note: item.note,
      };
    });

    return {
      tenderAmount: prepared.checkout.tenderAmount,
      tenderCurrency: prepared.checkout.tenderCurrency,
      expiresInSeconds: parseOptionalPositiveInteger(
        prepared.body.expiresInSeconds,
        "expiresInSeconds"
      ),
      checkoutLinesSnapshot,
      checkoutTotalsSnapshot: {
        subtotalUsd: prepared.checkout.subtotalUsd,
        subtotalKhr: prepared.checkout.subtotalKhr,
        discountUsd: prepared.checkout.discountUsd,
        discountKhr: prepared.checkout.discountKhr,
        vatUsd: prepared.checkout.vatUsd,
        vatKhr: prepared.checkout.vatKhr,
        grandTotalUsd: prepared.checkout.grandTotalUsd,
        grandTotalKhr: prepared.checkout.grandTotalKhr,
        paidAmountUsd: prepared.checkout.paidAmount,
      },
      pricingSnapshot: {
        saleFxRateKhrPerUsd: prepared.checkout.saleFxRateKhrPerUsd,
        saleKhrRoundingEnabled: prepared.checkout.saleKhrRoundingEnabled,
        saleKhrRoundingMode: prepared.checkout.saleKhrRoundingMode,
        saleKhrRoundingGranularity: prepared.checkout.saleKhrRoundingGranularity,
      },
      metadataSnapshot: {
        source: "checkout.khqr.initiate",
        itemCount: checkoutLinesSnapshot.length,
        saleType: prepared.checkout.saleType,
      },
      preview: {
        itemCount: checkoutLinesSnapshot.length,
        grandTotalUsd: prepared.checkout.grandTotalUsd,
        grandTotalKhr: prepared.checkout.grandTotalKhr,
      },
    };
  }

  private async prepareCheckoutFromLocalCart(input: {
    actor: ActorContext;
    body: unknown;
    forcedPaymentMethod: V0SalePaymentMethod;
  }): Promise<CheckoutPreparation> {
    const actor = assertBranchContext(input.actor);
    await this.requireOpenCashSession(actor, "SALE_CHECKOUT_REQUIRES_OPEN_CASH_SESSION");
    const body = toRecord(input.body);
    const itemDrafts = parseOrderItems(body.items, true);
    const items = await this.hydrateOrderItems({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      itemDrafts,
    });

    const virtualLines: V0OrderTicketLineRow[] = items.map((item, index) => ({
      id: `local-line-${index + 1}`,
      tenant_id: actor.tenantId,
      branch_id: actor.branchId,
      order_ticket_id: "00000000-0000-0000-0000-000000000000",
      menu_item_id: item.menuItemId,
      menu_item_name_snapshot: item.menuItemNameSnapshot,
      unit_price: item.unitPrice,
      quantity: item.quantity,
      line_subtotal: roundMoney(item.unitPrice * item.quantity),
      modifier_snapshot: item.modifierSnapshot,
      note: item.note,
      created_at: new Date(0),
      updated_at: new Date(0),
    }));

    const checkout = parseCheckoutBody(
      {
        ...body,
        paymentMethod: input.forcedPaymentMethod,
      },
      virtualLines
    );
    if (checkout.paymentMethod !== input.forcedPaymentMethod) {
      throw new V0SaleOrderError(
        422,
        `paymentMethod must be ${input.forcedPaymentMethod}`,
        "SALE_PAYMENT_METHOD_INVALID"
      );
    }

    return {
      actor,
      body,
      items,
      checkout,
    };
  }

  private async hydrateOrderItems(input: {
    tenantId: string;
    branchId: string;
    itemDrafts: ItemDraft[];
  }): Promise<ItemInput[]> {
    if (input.itemDrafts.length === 0) {
      return [];
    }

    const menuItemCache = new Map<
      string,
      {
        item: V0OrderMenuItemRow;
        groups: V0OrderMenuModifierGroupRow[];
        options: V0OrderMenuModifierOptionRow[];
      }
    >();
    const hydrated: ItemInput[] = [];

    for (const [index, draft] of input.itemDrafts.entries()) {
      let menuData = menuItemCache.get(draft.menuItemId);
      if (!menuData) {
        const item = await this.repo.getActiveMenuItemVisibleInBranch({
          tenantId: input.tenantId,
          branchId: input.branchId,
          menuItemId: draft.menuItemId,
        });
        if (!item) {
          throw new V0SaleOrderError(
            422,
            `items[${index}].menuItemId is unavailable in this branch`,
            "ORDER_ITEM_NOT_AVAILABLE"
          );
        }
        const groups = await this.repo.listActiveModifierGroupsForMenuItem({
          tenantId: input.tenantId,
          menuItemId: draft.menuItemId,
        });
        const options = await this.repo.listActiveModifierOptionsByGroupIds({
          tenantId: input.tenantId,
          groupIds: groups.map((group) => group.id),
        });
        menuData = { item, groups, options };
        menuItemCache.set(draft.menuItemId, menuData);
      }

      const selection = resolveModifierSelections({
        itemIndex: index,
        selections: draft.modifierSelections,
        groups: menuData.groups,
        options: menuData.options,
      });
      const unitPrice = roundMoney(menuData.item.base_price + selection.totalPriceDelta);

      hydrated.push({
        menuItemId: draft.menuItemId,
        menuItemNameSnapshot: menuData.item.name,
        unitPrice,
        quantity: draft.quantity,
        modifierSnapshot: selection.snapshot,
        note: draft.note,
      });
    }

    return hydrated;
  }

  private async requireSale(actor: { tenantId: string; branchId: string }, saleId: string) {
    const id = requireUuid(saleId, "saleId");
    const sale = await this.repo.getSaleById({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      saleId: id,
    });
    if (!sale) {
      throw new V0SaleOrderError(404, "sale not found", "SALE_NOT_FOUND");
    }
    return sale;
  }

  private async isWorkforceEnabled(actor: { tenantId: string; branchId: string }): Promise<boolean> {
    const enforcement = await this.repo.getBranchEntitlementEnforcement({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      entitlementKey: "module.workforce",
    });
    return enforcement === "ENABLED";
  }

  private async requireOpenCashSession(
    actor: { tenantId: string; branchId: string },
    code: "ORDER_REQUIRES_OPEN_CASH_SESSION" | "SALE_CHECKOUT_REQUIRES_OPEN_CASH_SESSION"
  ): Promise<void> {
    const hasOpenSession = await this.repo.hasOpenCashSession({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
    });
    if (!hasOpenSession) {
      const message = code === "ORDER_REQUIRES_OPEN_CASH_SESSION"
        ? "open cash session required to place or edit order"
        : "open cash session required to checkout order";
      throw new V0SaleOrderError(422, message, code);
    }
  }

  private async requirePayLaterEnabled(actor: {
    tenantId: string;
    branchId: string;
  }): Promise<void> {
    const enabled = await this.repo.isPayLaterEnabledForBranch({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
    });
    if (!enabled) {
      throw new V0SaleOrderError(
        422,
        "pay-later is disabled for this branch",
        "ORDER_PAY_LATER_DISABLED"
      );
    }
  }
}

function assertBranchContext(input: ActorContext): { accountId: string; tenantId: string; branchId: string } {
  const tenantId = normalizeOptionalString(input.tenantId);
  if (!tenantId) {
    throw new V0SaleOrderError(422, "tenant context required", "TENANT_CONTEXT_REQUIRED");
  }
  const branchId = normalizeOptionalString(input.branchId);
  if (!branchId) {
    throw new V0SaleOrderError(422, "branch context required", "BRANCH_CONTEXT_REQUIRED");
  }
  return {
    accountId: input.accountId,
    tenantId,
    branchId,
  };
}

function toRecord(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

function parseOrderItems(input: unknown, required: boolean): ItemDraft[] {
  if (!Array.isArray(input)) {
    if (required) {
      throw new V0SaleOrderError(422, "items must be a non-empty array", "ORDER_ITEMS_INVALID");
    }
    return [];
  }
  if (required && input.length === 0) {
    throw new V0SaleOrderError(422, "items must be a non-empty array", "ORDER_ITEMS_INVALID");
  }
  return input.map((item, index) => {
    const row = toRecord(item);
    const menuItemId = requireUuid(row.menuItemId, `items[${index}].menuItemId`);
    const quantity = requirePositiveNumber(row.quantity, `items[${index}].quantity`);
    const note = normalizeOptionalString(row.note) ?? null;
    const modifierSelections = parseModifierSelections(
      row.modifierSelections,
      `items[${index}].modifierSelections`
    );
    return {
      menuItemId,
      quantity,
      modifierSelections,
      note,
    };
  });
}

function parseModifierSelections(input: unknown, field: string): ModifierSelectionInput[] {
  if (input === undefined || input === null) {
    return [];
  }
  if (!Array.isArray(input)) {
    throw new V0SaleOrderError(
      422,
      `${field} must be an array`,
      "SALE_ORDER_VALIDATION_FAILED"
    );
  }

  const parsed = input.map((entry, index) => {
    const row = toRecord(entry);
    const groupId = requireUuid(row.groupId, `${field}[${index}].groupId`);
    if (!Array.isArray(row.optionIds)) {
      throw new V0SaleOrderError(
        422,
        `${field}[${index}].optionIds must be an array`,
        "SALE_ORDER_VALIDATION_FAILED"
      );
    }
    const optionIds = row.optionIds.map((optionId, optionIndex) =>
      requireUuid(optionId, `${field}[${index}].optionIds[${optionIndex}]`)
    );
    assertNoDuplicateValues(
      optionIds,
      `${field}[${index}].optionIds must not contain duplicates`
    );
    return {
      groupId,
      optionIds,
    };
  });

  assertNoDuplicateValues(
    parsed.map((entry) => entry.groupId),
    `${field} must not contain duplicate groupId entries`
  );

  return parsed;
}

function resolveModifierSelections(input: {
  itemIndex: number;
  selections: ModifierSelectionInput[];
  groups: V0OrderMenuModifierGroupRow[];
  options: V0OrderMenuModifierOptionRow[];
}): {
  totalPriceDelta: number;
  snapshot: Array<{
    groupId: string;
    groupName: string;
    selectionMode: "SINGLE" | "MULTI";
    minSelections: number;
    maxSelections: number;
    isRequired: boolean;
    selectedOptions: Array<{
      optionId: string;
      label: string;
      priceDelta: number;
    }>;
  }>;
} {
  const groupById = new Map(input.groups.map((group) => [group.id, group] as const));
  const optionById = new Map(input.options.map((option) => [option.id, option] as const));
  const selectionByGroup = new Map(input.selections.map((entry) => [entry.groupId, entry] as const));

  for (const groupId of selectionByGroup.keys()) {
    if (!groupById.has(groupId)) {
      throw new V0SaleOrderError(
        422,
        `items[${input.itemIndex}].modifierSelections includes unsupported groupId`,
        "ORDER_ITEM_MODIFIER_INVALID"
      );
    }
  }

  let totalPriceDelta = 0;
  const snapshot: Array<{
    groupId: string;
    groupName: string;
    selectionMode: "SINGLE" | "MULTI";
    minSelections: number;
    maxSelections: number;
    isRequired: boolean;
    selectedOptions: Array<{
      optionId: string;
      label: string;
      priceDelta: number;
    }>;
  }> = [];

  for (const group of input.groups) {
    const selected = selectionByGroup.get(group.id);
    const optionIds = selected?.optionIds ?? [];

    if (group.selection_mode === "SINGLE" && optionIds.length > 1) {
      throw new V0SaleOrderError(
        422,
        `items[${input.itemIndex}] modifier group ${group.id} allows only one option`,
        "ORDER_ITEM_MODIFIER_INVALID"
      );
    }

    const minimumSelections = Math.max(group.min_selections, group.is_required ? 1 : 0);
    if (optionIds.length < minimumSelections) {
      throw new V0SaleOrderError(
        422,
        `items[${input.itemIndex}] modifier group ${group.id} requires at least ${minimumSelections} option(s)`,
        "ORDER_ITEM_MODIFIER_INVALID"
      );
    }
    if (optionIds.length > group.max_selections) {
      throw new V0SaleOrderError(
        422,
        `items[${input.itemIndex}] modifier group ${group.id} allows at most ${group.max_selections} option(s)`,
        "ORDER_ITEM_MODIFIER_INVALID"
      );
    }

    if (optionIds.length === 0) {
      continue;
    }

    const selectedOptions = optionIds.map((optionId) => {
      const option = optionById.get(optionId);
      if (!option || option.modifier_group_id !== group.id) {
        throw new V0SaleOrderError(
          422,
          `items[${input.itemIndex}] modifier option ${optionId} is invalid for group ${group.id}`,
          "ORDER_ITEM_MODIFIER_INVALID"
        );
      }
      totalPriceDelta = roundMoney(totalPriceDelta + option.price_delta);
      return {
        optionId: option.id,
        label: option.label,
        priceDelta: option.price_delta,
      };
    });

    snapshot.push({
      groupId: group.id,
      groupName: group.name,
      selectionMode: group.selection_mode,
      minSelections: group.min_selections,
      maxSelections: group.max_selections,
      isRequired: group.is_required,
      selectedOptions,
    });
  }

  return {
    totalPriceDelta,
    snapshot,
  };
}

function assertNoDuplicateValues(values: readonly string[], message: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new V0SaleOrderError(422, message, "SALE_ORDER_VALIDATION_FAILED");
    }
    seen.add(value);
  }
}

function parseCheckoutBody(body: Record<string, unknown>, lines: V0OrderTicketLineRow[]): CheckoutInput {
  const paymentMethod = parsePaymentMethod(body.paymentMethod);
  const saleType = parseSaleType(body.saleType);
  const saleFxRateKhrPerUsd = requirePositiveNumberOrDefault(
    body.saleFxRateKhrPerUsd,
    4100,
    "saleFxRateKhrPerUsd"
  );
  const saleKhrRoundingEnabled = parseBooleanOrDefault(body.saleKhrRoundingEnabled, true);
  const saleKhrRoundingMode = parseRoundingMode(body.saleKhrRoundingMode);
  const saleKhrRoundingGranularity = parseRoundingGranularity(body.saleKhrRoundingGranularity);

  const linesSubtotalUsd = roundMoney(lines.reduce((sum, line) => sum + line.line_subtotal, 0));
  const subtotalUsd = parseNumberOrDefault(body.subtotalUsd, linesSubtotalUsd, "subtotalUsd");
  const discountUsd = parseNumberOrDefault(body.discountUsd, 0, "discountUsd");
  const vatUsd = parseNumberOrDefault(body.vatUsd, 0, "vatUsd");
  const grandTotalUsd = parseNumberOrDefault(
    body.grandTotalUsd,
    roundMoney(subtotalUsd - discountUsd + vatUsd),
    "grandTotalUsd"
  );

  const subtotalKhr = parseNumberOrDefault(
    body.subtotalKhr,
    roundMoney(subtotalUsd * saleFxRateKhrPerUsd),
    "subtotalKhr"
  );
  const discountKhr = parseNumberOrDefault(
    body.discountKhr,
    roundMoney(discountUsd * saleFxRateKhrPerUsd),
    "discountKhr"
  );
  const vatKhr = parseNumberOrDefault(
    body.vatKhr,
    roundMoney(vatUsd * saleFxRateKhrPerUsd),
    "vatKhr"
  );
  const grandTotalKhr = parseNumberOrDefault(
    body.grandTotalKhr,
    roundMoney(grandTotalUsd * saleFxRateKhrPerUsd),
    "grandTotalKhr"
  );

  const tenderCurrency = parseTenderCurrency(body.tenderCurrency);
  const defaultTenderAmount = tenderCurrency === "USD" ? grandTotalUsd : grandTotalKhr;
  const tenderAmount = parseNumberOrDefault(body.tenderAmount, defaultTenderAmount, "tenderAmount");
  if (paymentMethod === "KHQR" && Math.abs(tenderAmount - defaultTenderAmount) > 0.009) {
    throw new V0SaleOrderError(
      422,
      "khqr tenderAmount must match sale grand total",
      "SALE_KHQR_TENDER_AMOUNT_INVALID"
    );
  }
  const parsedCashReceivedTenderAmount = parseNullableNumber(
    body.cashReceivedTenderAmount,
    "cashReceivedTenderAmount"
  );
  const cashReceivedTenderAmount = paymentMethod === "CASH"
    ? (parsedCashReceivedTenderAmount ?? tenderAmount)
    : parsedCashReceivedTenderAmount;
  if (paymentMethod === "CASH" && Math.abs(tenderAmount - defaultTenderAmount) > 0.009) {
    throw new V0SaleOrderError(
      422,
      "cash tenderAmount must match sale grand total",
      "SALE_CASH_TENDER_AMOUNT_INVALID"
    );
  }
  if (
    paymentMethod === "CASH" &&
    cashReceivedTenderAmount !== null &&
    cashReceivedTenderAmount + 0.009 < tenderAmount
  ) {
    throw new V0SaleOrderError(
      422,
      "cashReceivedTenderAmount must cover tenderAmount",
      "SALE_CASH_RECEIVED_INSUFFICIENT"
    );
  }
  const cashChangeTenderAmount = parseNumberOrDefault(
    body.cashChangeTenderAmount,
    paymentMethod === "CASH" && cashReceivedTenderAmount !== null
      ? roundMoney(Math.max(cashReceivedTenderAmount - tenderAmount, 0))
      : 0,
    "cashChangeTenderAmount"
  );
  const paidAmount = parseNumberOrDefault(
    body.paidAmount,
    tenderCurrency === "USD"
      ? tenderAmount
      : roundMoney(tenderAmount / saleFxRateKhrPerUsd),
    "paidAmount"
  );

  const khqrMd5 = normalizeOptionalString(body.khqrMd5);
  const khqrToAccountId = normalizeOptionalString(body.khqrToAccountId);
  const khqrHash = normalizeOptionalString(body.khqrHash);
  const khqrConfirmedAt = parseOptionalDate(body.khqrConfirmedAt, "khqrConfirmedAt");

  return {
    paymentMethod,
    saleType,
    tenderCurrency,
    tenderAmount,
    cashReceivedTenderAmount,
    cashChangeTenderAmount,
    khqrMd5: khqrMd5 ?? null,
    khqrToAccountId: khqrToAccountId ?? null,
    khqrHash: khqrHash ?? null,
    khqrConfirmedAt,
    subtotalUsd,
    subtotalKhr,
    discountUsd,
    discountKhr,
    vatUsd,
    vatKhr,
    grandTotalUsd,
    grandTotalKhr,
    saleFxRateKhrPerUsd,
    saleKhrRoundingEnabled,
    saleKhrRoundingMode,
    saleKhrRoundingGranularity,
    paidAmount,
  };
}

function parseFinalizeBody(body: Record<string, unknown>, sale: V0SaleRow): SaleFinalizeInput {
  const paidAmount = parseNumberOrDefault(body.paidAmount, sale.paid_amount, "paidAmount");
  const tenderAmount = parseNullableNumber(body.tenderAmount, "tenderAmount");
  const cashReceivedTenderAmount = parseNullableNumber(
    body.cashReceivedTenderAmount,
    "cashReceivedTenderAmount"
  );
  const cashChangeTenderAmount = parseNullableNumber(
    body.cashChangeTenderAmount,
    "cashChangeTenderAmount"
  );
  return {
    paidAmount,
    tenderAmount,
    cashReceivedTenderAmount,
    cashChangeTenderAmount,
    khqrMd5: normalizeOptionalString(body.khqrMd5) ?? null,
    khqrHash: normalizeOptionalString(body.khqrHash) ?? null,
    khqrConfirmedAt: parseOptionalDate(body.khqrConfirmedAt, "khqrConfirmedAt"),
  };
}

function parseOrderStatusFilter(input: string | undefined): V0OrderTicketStatus | null {
  const status = normalizeOptionalString(input)?.toUpperCase();
  if (!status || status === "ALL") {
    return null;
  }
  if (status === "OPEN" || status === "CHECKED_OUT" || status === "CANCELLED") {
    return status;
  }
  throw new V0SaleOrderError(422, "invalid order status", "ORDER_STATUS_INVALID");
}

function parseSaleStatusFilter(input: string | undefined): V0SaleStatus | null {
  const status = normalizeOptionalString(input)?.toUpperCase();
  if (!status || status === "ALL") {
    return null;
  }
  if (status === "PENDING" || status === "FINALIZED" || status === "VOID_PENDING" || status === "VOIDED") {
    return status;
  }
  throw new V0SaleOrderError(422, "invalid sale status", "SALE_STATUS_INVALID");
}

function parsePaymentMethod(input: unknown): V0SalePaymentMethod {
  const value = normalizeOptionalString(input)?.toUpperCase();
  if (value === "CASH" || value === "KHQR") {
    return value;
  }
  throw new V0SaleOrderError(422, "paymentMethod must be CASH or KHQR", "SALE_PAYMENT_METHOD_INVALID");
}

function parseTenderCurrency(input: unknown): V0TenderCurrency {
  const value = normalizeOptionalString(input)?.toUpperCase();
  if (!value || value === "USD") {
    return "USD";
  }
  if (value === "KHR") {
    return "KHR";
  }
  throw new V0SaleOrderError(422, "tenderCurrency must be USD or KHR", "SALE_TENDER_CURRENCY_INVALID");
}

function parseSaleType(input: unknown): V0SaleType {
  const raw = normalizeOptionalString(input);
  if (!raw) {
    return "DINE_IN";
  }
  const normalized = raw.toUpperCase().replaceAll("-", "_");
  if (normalized === "DINE_IN") {
    return "DINE_IN";
  }
  if (normalized === "TAKEAWAY" || normalized === "TAKE_AWAY") {
    return "TAKEAWAY";
  }
  if (normalized === "DELIVERY") {
    return "DELIVERY";
  }
  throw new V0SaleOrderError(
    422,
    "saleType must be DINE_IN, TAKEAWAY, or DELIVERY",
    "SALE_TYPE_INVALID"
  );
}

function parseFulfillmentStatus(input: unknown): V0OrderFulfillmentBatchStatus {
  const value = normalizeOptionalString(input)?.toUpperCase();
  if (
    value === "PENDING" ||
    value === "PREPARING" ||
    value === "READY" ||
    value === "COMPLETED" ||
    value === "CANCELLED"
  ) {
    return value;
  }
  throw new V0SaleOrderError(422, "invalid fulfillment status", "ORDER_FULFILLMENT_STATUS_INVALID");
}

function parseRoundingMode(input: unknown): "NEAREST" | "UP" | "DOWN" {
  const value = normalizeOptionalString(input)?.toUpperCase();
  if (!value || value === "NEAREST" || value === "UP" || value === "DOWN") {
    return (value as "NEAREST" | "UP" | "DOWN" | undefined) ?? "NEAREST";
  }
  throw new V0SaleOrderError(422, "invalid saleKhrRoundingMode", "SALE_ROUNDING_MODE_INVALID");
}

function parseRoundingGranularity(input: unknown): 100 | 1000 {
  if (input === undefined || input === null || input === "") {
    return 100;
  }
  const value = Number(input);
  if (value === 100 || value === 1000) {
    return value;
  }
  throw new V0SaleOrderError(422, "invalid saleKhrRoundingGranularity", "SALE_ROUNDING_GRANULARITY_INVALID");
}

function parseBooleanOrDefault(input: unknown, fallback: boolean): boolean {
  if (input === undefined || input === null) {
    return fallback;
  }
  if (typeof input === "boolean") {
    return input;
  }
  throw new V0SaleOrderError(422, "invalid boolean field", "SALE_BOOLEAN_FIELD_INVALID");
}

function parseNumberOrDefault(input: unknown, fallback: number, field: string): number {
  if (input === undefined || input === null || input === "") {
    return fallback;
  }
  const value = Number(input);
  if (!Number.isFinite(value)) {
    throw new V0SaleOrderError(422, `${field} must be a finite number`, "SALE_NUMBER_INVALID");
  }
  return roundMoney(value);
}

function parseNullableNumber(input: unknown, field: string): number | null {
  if (input === undefined || input === null || input === "") {
    return null;
  }
  const value = Number(input);
  if (!Number.isFinite(value)) {
    throw new V0SaleOrderError(422, `${field} must be a finite number`, "SALE_NUMBER_INVALID");
  }
  return roundMoney(value);
}

function parseOptionalPositiveInteger(input: unknown, field: string): number | null {
  if (input === undefined || input === null || input === "") {
    return null;
  }
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0) {
    throw new V0SaleOrderError(
      422,
      `${field} must be a positive integer`,
      "SALE_ORDER_VALIDATION_FAILED"
    );
  }
  return Math.floor(value);
}

function requireUuid(input: unknown, field: string): string {
  const value = normalizeOptionalString(input);
  if (!value) {
    throw new V0SaleOrderError(422, `${field} is required`, "SALE_ORDER_VALIDATION_FAILED");
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(value)) {
    throw new V0SaleOrderError(422, `${field} must be a valid UUID`, "SALE_ORDER_VALIDATION_FAILED");
  }
  return value;
}

function requireNonEmptyString(input: unknown, field: string): string {
  const value = normalizeOptionalString(input);
  if (!value) {
    throw new V0SaleOrderError(422, `${field} is required`, "SALE_ORDER_VALIDATION_FAILED");
  }
  return value;
}

function requirePositiveNumber(input: unknown, field: string): number {
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0) {
    throw new V0SaleOrderError(422, `${field} must be greater than 0`, "SALE_ORDER_VALIDATION_FAILED");
  }
  return roundMoney(value);
}

function requirePositiveNumberOrDefault(input: unknown, fallback: number, field: string): number {
  if (input === undefined || input === null || input === "") {
    return fallback;
  }
  return requirePositiveNumber(input, field);
}

function parseOptionalDate(input: unknown, field: string): Date | null {
  const value = normalizeOptionalString(input);
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new V0SaleOrderError(422, `${field} must be an ISO datetime`, "SALE_ORDER_VALIDATION_FAILED");
  }
  return parsed;
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 100;
  }
  const rounded = Math.floor(value);
  if (rounded <= 0) {
    return 100;
  }
  return Math.min(rounded, 500);
}

function normalizeOffset(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 0;
  }
  const rounded = Math.floor(value);
  return rounded < 0 ? 0 : rounded;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function mapOrderTicketSummary(row: V0OrderTicketRow): Record<string, unknown> {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapOrderTicket(row: V0OrderTicketRow): Record<string, unknown> {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    openedByAccountId: row.opened_by_account_id,
    status: row.status,
    checkedOutAt: row.checked_out_at?.toISOString() ?? null,
    checkedOutByAccountId: row.checked_out_by_account_id,
    cancelledAt: row.cancelled_at?.toISOString() ?? null,
    cancelledByAccountId: row.cancelled_by_account_id,
    cancelReason: row.cancel_reason,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapOrderTicketLine(row: V0OrderTicketLineRow): Record<string, unknown> {
  return {
    id: row.id,
    orderId: row.order_ticket_id,
    menuItemId: row.menu_item_id,
    menuItemNameSnapshot: row.menu_item_name_snapshot,
    unitPrice: row.unit_price,
    quantity: row.quantity,
    lineSubtotal: row.line_subtotal,
    modifierSnapshot: row.modifier_snapshot,
    note: row.note,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapSaleSummary(row: V0SaleRow): Record<string, unknown> {
  return {
    id: row.id,
    status: row.status,
    saleType: row.sale_type,
    paymentMethod: row.payment_method,
    tenderCurrency: row.tender_currency,
    grandTotalUsd: row.grand_total_usd,
    grandTotalKhr: row.grand_total_khr,
    finalizedAt: row.finalized_at?.toISOString() ?? null,
    voidedAt: row.voided_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapSale(row: V0SaleRow): Record<string, unknown> {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    orderId: row.order_ticket_id,
    status: row.status,
    saleType: row.sale_type,
    paymentMethod: row.payment_method,
    tenderCurrency: row.tender_currency,
    tenderAmount: row.tender_amount,
    cashReceivedTenderAmount: row.cash_received_tender_amount,
    cashChangeTenderAmount: row.cash_change_tender_amount,
    subtotalUsd: row.subtotal_usd,
    subtotalKhr: row.subtotal_khr,
    discountUsd: row.discount_usd,
    discountKhr: row.discount_khr,
    vatUsd: row.vat_usd,
    vatKhr: row.vat_khr,
    grandTotalUsd: row.grand_total_usd,
    grandTotalKhr: row.grand_total_khr,
    saleFxRateKhrPerUsd: row.sale_fx_rate_khr_per_usd,
    saleKhrRoundingEnabled: row.sale_khr_rounding_enabled,
    saleKhrRoundingMode: row.sale_khr_rounding_mode,
    saleKhrRoundingGranularity: String(row.sale_khr_rounding_granularity),
    khqrMd5: row.khqr_md5,
    khqrToAccountId: row.khqr_to_account_id,
    khqrHash: row.khqr_hash,
    khqrConfirmedAt: row.khqr_confirmed_at?.toISOString() ?? null,
    finalizedAt: row.finalized_at?.toISOString() ?? null,
    voidedAt: row.voided_at?.toISOString() ?? null,
    voidReason: row.void_reason,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapSaleLine(row: V0SaleLineRow): Record<string, unknown> {
  return {
    id: row.id,
    saleId: row.sale_id,
    orderLineId: row.order_ticket_line_id,
    menuItemId: row.menu_item_id,
    menuItemNameSnapshot: row.menu_item_name_snapshot,
    unitPrice: row.unit_price,
    quantity: row.quantity,
    lineDiscountAmount: row.line_discount_amount,
    lineTotalAmount: row.line_total_amount,
    modifierSnapshot: row.modifier_snapshot,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapVoidRequest(row: V0VoidRequestRow): Record<string, unknown> {
  return {
    id: row.id,
    saleId: row.sale_id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    requestedByAccountId: row.requested_by_account_id,
    reviewedByAccountId: row.reviewed_by_account_id,
    status: row.status,
    reason: row.reason,
    reviewNote: row.review_note,
    requestedAt: row.requested_at.toISOString(),
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapFulfillmentBatch(row: V0OrderFulfillmentBatchRow): Record<string, unknown> {
  return {
    id: row.id,
    orderId: row.order_ticket_id,
    status: row.status,
    note: row.note,
    createdByAccountId: row.created_by_account_id,
    completedAt: row.completed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
