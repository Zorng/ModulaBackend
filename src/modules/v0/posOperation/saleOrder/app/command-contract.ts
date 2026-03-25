import {
  buildCommandDedupeKey,
  type CommandOutcome,
} from "../../../../../shared/utils/dedupe.js";

export type SaleOrderCommandOutcome = CommandOutcome;

export const V0_SALE_ORDER_ACTION_KEYS = {
  checkoutCashFinalize: "checkout.cash.finalize",
  checkoutKhqrInitiate: "checkout.khqr.initiate",
  checkoutKhqrIntentRead: "checkout.khqr.intent.read",
  checkoutKhqrIntentCancel: "checkout.khqr.intent.cancel",

  orderPlace: "order.place",
  orderCancel: "order.cancel",
  orderItemsAdd: "order.items.add",
  orderCheckout: "order.checkout",
  orderManualPaymentClaimList: "order.manualPaymentClaim.list",
  orderManualPaymentClaimCreate: "order.manualPaymentClaim.create",
  orderManualPaymentClaimApprove: "order.manualPaymentClaim.approve",
  orderManualPaymentClaimReject: "order.manualPaymentClaim.reject",
  orderFulfillmentStatusUpdate: "order.fulfillment.status.update",
  orderList: "order.list",
  orderRead: "order.read",

  saleFinalize: "sale.finalize",
  saleVoidRequest: "sale.void.request",
  saleVoidApprove: "sale.void.approve",
  saleVoidReject: "sale.void.reject",
  saleVoidExecute: "sale.void.execute",
  saleList: "sale.list",
  saleVoidRequestList: "sale.void.request.list",
  saleRead: "sale.read",
  saleVoidRequestRead: "sale.void.request.read",
} as const;

export const V0_SALE_ORDER_EVENT_TYPES = {
  checkoutCashFinalized: "CHECKOUT_CASH_FINALIZED",
  checkoutKhqrInitiated: "CHECKOUT_KHQR_INITIATED",
  checkoutKhqrIntentCancelled: "CHECKOUT_KHQR_INTENT_CANCELLED",

  orderTicketPlaced: "ORDER_TICKET_PLACED",
  orderTicketCancelled: "ORDER_TICKET_CANCELLED",
  orderItemsAdded: "ORDER_ITEMS_ADDED",
  orderCheckoutCompleted: "ORDER_CHECKOUT_COMPLETED",
  orderManualPaymentClaimCreated: "ORDER_MANUAL_PAYMENT_CLAIM_CREATED",
  orderManualPaymentClaimRejected: "ORDER_MANUAL_PAYMENT_CLAIM_REJECTED",
  orderFulfillmentStatusUpdated: "ORDER_FULFILLMENT_STATUS_UPDATED",
  saleFinalized: "SALE_FINALIZED",
  saleVoidRequested: "SALE_VOID_REQUESTED",
  saleVoidApproved: "SALE_VOID_APPROVED",
  saleVoidRejected: "SALE_VOID_REJECTED",
  saleVoidExecuted: "SALE_VOID_EXECUTED",
} as const;

export const V0_SALE_ORDER_IDEMPOTENCY_SCOPE = {
  branchWriteActions: [
    V0_SALE_ORDER_ACTION_KEYS.checkoutCashFinalize,
    V0_SALE_ORDER_ACTION_KEYS.checkoutKhqrInitiate,
    V0_SALE_ORDER_ACTION_KEYS.checkoutKhqrIntentCancel,
    V0_SALE_ORDER_ACTION_KEYS.orderPlace,
    V0_SALE_ORDER_ACTION_KEYS.orderCancel,
    V0_SALE_ORDER_ACTION_KEYS.orderItemsAdd,
    V0_SALE_ORDER_ACTION_KEYS.orderCheckout,
    V0_SALE_ORDER_ACTION_KEYS.orderManualPaymentClaimCreate,
    V0_SALE_ORDER_ACTION_KEYS.orderManualPaymentClaimApprove,
    V0_SALE_ORDER_ACTION_KEYS.orderManualPaymentClaimReject,
    V0_SALE_ORDER_ACTION_KEYS.orderFulfillmentStatusUpdate,
    V0_SALE_ORDER_ACTION_KEYS.saleFinalize,
    V0_SALE_ORDER_ACTION_KEYS.saleVoidRequest,
    V0_SALE_ORDER_ACTION_KEYS.saleVoidApprove,
    V0_SALE_ORDER_ACTION_KEYS.saleVoidReject,
    V0_SALE_ORDER_ACTION_KEYS.saleVoidExecute,
  ] as const,
} as const;

export const V0_SALE_ORDER_PUSH_SYNC_OPERATION_TYPES = [
  "checkout.cash.finalize",
  "order.manualExternalPaymentClaim.capture",
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
