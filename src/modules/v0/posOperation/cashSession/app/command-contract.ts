import {
  buildCommandDedupeKey,
  type CommandOutcome,
} from "../../../../../shared/utils/dedupe.js";

export type CashSessionCommandOutcome = CommandOutcome;

export const V0_CASH_SESSION_ACTION_KEYS = {
  open: "cashSession.open",
  close: "cashSession.close",
  forceClose: "cashSession.forceClose",
  recordPaidIn: "cashSession.movement.paidIn",
  recordPaidOut: "cashSession.movement.paidOut",
  recordAdjustment: "cashSession.movement.adjustment",

  readActive: "cashSession.active.read",
  listSessions: "cashSession.list",
  readSession: "cashSession.read",
  listSessionSales: "cashSession.sales.list",
  listMovements: "cashSession.movements.list",
  viewX: "cashSession.x.view",
  viewZ: "cashSession.z.view",

  recordSaleIn: "cashSession.saleIn.record",
  recordRefund: "cashSession.refund",
} as const;

export const V0_CASH_SESSION_EVENT_TYPES = {
  opened: "CASH_SESSION_OPENED",
  closed: "CASH_SESSION_CLOSED",
  forceClosed: "CASH_SESSION_FORCE_CLOSED",
  movementRecorded: "CASH_MOVEMENT_RECORDED",
  adjustmentRecorded: "CASH_ADJUSTMENT_RECORDED",
  xViewed: "CASH_X_REPORT_VIEWED",
  zViewed: "CASH_Z_REPORT_VIEWED",
} as const;

export const V0_CASH_SESSION_IDEMPOTENCY_SCOPE = {
  branchWriteActions: [
    V0_CASH_SESSION_ACTION_KEYS.open,
    V0_CASH_SESSION_ACTION_KEYS.close,
    V0_CASH_SESSION_ACTION_KEYS.forceClose,
    V0_CASH_SESSION_ACTION_KEYS.recordPaidIn,
    V0_CASH_SESSION_ACTION_KEYS.recordPaidOut,
    V0_CASH_SESSION_ACTION_KEYS.recordAdjustment,
    V0_CASH_SESSION_ACTION_KEYS.recordSaleIn,
    V0_CASH_SESSION_ACTION_KEYS.recordRefund,
  ] as const,
} as const;

export function buildCashSessionCommandDedupeKey(
  actionKey: string,
  idempotencyKey: string | null | undefined,
  outcome: CashSessionCommandOutcome,
  parts?: ReadonlyArray<unknown>
): string | null {
  return buildCommandDedupeKey({
    actionKey,
    idempotencyKey,
    outcome,
    parts,
  });
}

export function buildSaleCashMovementAnchor(saleId: string): string {
  return `sale:${saleId}`;
}
