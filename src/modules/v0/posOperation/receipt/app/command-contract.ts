import {
  buildCommandDedupeKey,
  type CommandOutcome,
} from "../../../../../shared/utils/dedupe.js";

export type ReceiptCommandOutcome = CommandOutcome;

export type ReceiptPrintPurpose = "AUTO_AFTER_FINALIZE" | "MANUAL_REPRINT";

export const V0_RECEIPT_ACTION_KEYS = {
  read: "receipt.read",
  readBySale: "receipt.readBySale",
  print: "receipt.print",
  reprint: "receipt.reprint",
} as const;

export const V0_RECEIPT_EVENT_TYPES = {
  printRequested: "RECEIPT_PRINT_REQUESTED",
  reprintRequested: "RECEIPT_REPRINT_REQUESTED",
} as const;

export const V0_RECEIPT_IDEMPOTENCY_SCOPE = {
  branchWriteActions: [
    V0_RECEIPT_ACTION_KEYS.print,
    V0_RECEIPT_ACTION_KEYS.reprint,
  ] as const,
} as const;

export function buildReceiptCommandDedupeKey(
  actionKey: string,
  idempotencyKey: string | null | undefined,
  outcome: ReceiptCommandOutcome,
  parts?: ReadonlyArray<unknown>
): string | null {
  return buildCommandDedupeKey({
    actionKey,
    idempotencyKey,
    outcome,
    parts,
  });
}

export function buildReceiptPrintAnchor(input: {
  receiptId: string;
  purpose: ReceiptPrintPurpose;
}): string {
  return `receipt.print:${input.purpose}:${input.receiptId}`;
}
