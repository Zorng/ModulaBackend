export function resolveReceiptIssuedAt(input: {
  finalizedAt: Date | null;
  updatedAt: Date | null;
  createdAt: Date;
}): Date {
  return input.finalizedAt ?? input.updatedAt ?? input.createdAt;
}

export function formatReceiptNumber(input: {
  issuedAt: Date;
  displayNumber: string;
}): string {
  const year = input.issuedAt.getUTCFullYear();
  const month = String(input.issuedAt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(input.issuedAt.getUTCDate()).padStart(2, "0");
  const serial = input.displayNumber.padStart(6, "0");
  return `RCP-${year}${month}${day}-${serial}`;
}

export function deriveSaleReceiptNumber(input: {
  finalizedAt: Date | null;
  updatedAt: Date | null;
  createdAt: Date;
  displayNumber?: string;
}): string {
  return formatReceiptNumber({
    issuedAt: resolveReceiptIssuedAt(input),
    displayNumber: input.displayNumber ?? "0",
  });
}
