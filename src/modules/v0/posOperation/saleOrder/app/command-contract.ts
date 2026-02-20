import {
  buildCommandDedupeKey,
  type CommandOutcome,
} from "../../../../../shared/utils/dedupe.js";

export type SaleOrderCommandOutcome = CommandOutcome;

export const V0_SALE_ORDER_ACTION_KEYS = {
  orderPlace: "order.place",
  orderItemsAdd: "order.items.add",
  orderCheckout: "order.checkout",
  orderFulfillmentStatusUpdate: "order.fulfillment.status.update",
  orderList: "order.list",
  orderRead: "order.read",

  saleFinalize: "sale.finalize",
  saleVoidRequest: "sale.void.request",
  saleVoidApprove: "sale.void.approve",
  saleVoidReject: "sale.void.reject",
  saleVoidExecute: "sale.void.execute",
  saleList: "sale.list",
  saleRead: "sale.read",
  saleVoidRequestRead: "sale.void.request.read",
} as const;

export const V0_SALE_ORDER_EVENT_TYPES = {
  orderTicketPlaced: "ORDER_TICKET_PLACED",
  orderItemsAdded: "ORDER_ITEMS_ADDED",
  orderCheckoutCompleted: "ORDER_CHECKOUT_COMPLETED",
  orderFulfillmentStatusUpdated: "ORDER_FULFILLMENT_STATUS_UPDATED",
  saleFinalized: "SALE_FINALIZED",
  saleVoidRequested: "SALE_VOID_REQUESTED",
  saleVoidApproved: "SALE_VOID_APPROVED",
  saleVoidRejected: "SALE_VOID_REJECTED",
  saleVoidExecuted: "SALE_VOID_EXECUTED",
} as const;

export const V0_SALE_ORDER_IDEMPOTENCY_SCOPE = {
  branchWriteActions: [
    V0_SALE_ORDER_ACTION_KEYS.orderPlace,
    V0_SALE_ORDER_ACTION_KEYS.orderItemsAdd,
    V0_SALE_ORDER_ACTION_KEYS.orderCheckout,
    V0_SALE_ORDER_ACTION_KEYS.orderFulfillmentStatusUpdate,
    V0_SALE_ORDER_ACTION_KEYS.saleFinalize,
    V0_SALE_ORDER_ACTION_KEYS.saleVoidRequest,
    V0_SALE_ORDER_ACTION_KEYS.saleVoidApprove,
    V0_SALE_ORDER_ACTION_KEYS.saleVoidReject,
    V0_SALE_ORDER_ACTION_KEYS.saleVoidExecute,
  ] as const,
} as const;

export const V0_SALE_ORDER_PUSH_SYNC_OPERATION_TYPES = [
  "sale.finalize",
  "sale.void.execute",
] as const;

export type V0SaleOrderPushSyncOperationType =
  (typeof V0_SALE_ORDER_PUSH_SYNC_OPERATION_TYPES)[number];

export function buildSaleOrderCommandDedupeKey(
  actionKey: string,
  idempotencyKey: string | null | undefined,
  outcome: SaleOrderCommandOutcome,
  parts?: ReadonlyArray<unknown>
): string | null {
  return buildCommandDedupeKey({
    actionKey,
    idempotencyKey,
    outcome,
    parts,
  });
}

export function buildSaleFinalizeAnchor(input: {
  saleId: string;
}): string {
  return `sale.finalize:${input.saleId}`;
}

export function buildSaleVoidExecuteAnchor(input: {
  saleId: string;
}): string {
  return `sale.void.execute:${input.saleId}`;
}

export function buildSaleVoidRequestAnchor(input: {
  saleId: string;
}): string {
  return `sale.void.request:${input.saleId}`;
}
