import crypto from "crypto";

export type V0TokenClaims = {
  sub: string;
  accountId: string;
  sid: string;
  tenantId: string | null;
  branchId: string | null;
  scope: "v0";
};

export class V0AuthError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code?: string
  ) {
    super(message);
    this.name = "V0AuthError";
  }
}

export function normalizePhone(phone: string): string {
  return String(phone ?? "").trim();
}

export function normalizeOptionalText(input: string | undefined): string | null {
  const value = String(input ?? "").trim();
  return value.length > 0 ? value : null;
}

export function normalizeRoleKey(input: string | undefined): string {
  return String(input ?? "").trim().toUpperCase();
}

export function normalizeUniqueBranchIds(branchIds: string[] | undefined): string[] {
  if (!Array.isArray(branchIds)) {
    return [];
  }

  const normalized = branchIds
    .map((branchId) => String(branchId ?? "").trim())
    .filter((branchId) => branchId.length > 0);
  return Array.from(new Set(normalized));
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function parseExpiryToMs(time: string): number {
  const units: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  const match = time.match(/^(\d+)([smhd])$/);
  if (!match) {
    return 7 * 24 * 60 * 60 * 1000;
  }
  const unit = match[2] as keyof typeof units;
  return Number(match[1]) * units[unit];
}
