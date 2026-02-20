import type {
  V0KhqrCurrency,
  V0KhqrProvider,
  V0KhqrVerificationStatus,
} from "../infra/repository.js";

export type V0KhqrVerificationResult = {
  provider: V0KhqrProvider;
  verificationStatus: V0KhqrVerificationStatus;
  reasonCode: string | null;
  providerReference: string | null;
  providerEventId: string | null;
  providerTxHash: string | null;
  providerConfirmedAmount: number | null;
  providerConfirmedCurrency: V0KhqrCurrency | null;
  providerConfirmedToAccountId: string | null;
  providerConfirmedAt: Date | null;
  proofPayload: Record<string, unknown> | null;
};

export type V0KhqrWebhookVerificationStatus =
  | "CONFIRMED"
  | "UNPAID"
  | "EXPIRED"
  | "NOT_FOUND";

export type V0KhqrWebhookEvent = {
  provider: V0KhqrProvider;
  tenantId: string;
  branchId: string;
  md5: string;
  providerEventId: string | null;
  providerTxHash: string | null;
  providerReference: string | null;
  verificationStatus: V0KhqrWebhookVerificationStatus;
  providerConfirmedAmount: number | null;
  providerConfirmedCurrency: V0KhqrCurrency | null;
  providerConfirmedToAccountId: string | null;
  occurredAt: Date;
  proofPayload: Record<string, unknown> | null;
};

export interface V0KhqrPaymentProvider {
  verifyByMd5(input: {
    tenantId: string;
    branchId: string;
    md5: string;
    expectedAmount: number;
    expectedCurrency: V0KhqrCurrency;
    expectedToAccountId: string;
  }): Promise<V0KhqrVerificationResult>;
  parseWebhookEvent(input: {
    headers: Record<string, unknown>;
    body: Record<string, unknown>;
  }): V0KhqrWebhookEvent;
}

export class V0KhqrProviderError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "V0KhqrProviderError";
  }
}

export class StubV0KhqrPaymentProvider implements V0KhqrPaymentProvider {
  async verifyByMd5(input: {
    tenantId: string;
    branchId: string;
    md5: string;
    expectedAmount: number;
    expectedCurrency: V0KhqrCurrency;
    expectedToAccountId: string;
  }): Promise<V0KhqrVerificationResult> {
    const status = resolveStubStatus(input.md5);
    const now = new Date();

    if (status === "CONFIRMED") {
      return {
        provider: "STUB",
        verificationStatus: "CONFIRMED",
        reasonCode: null,
        providerReference: `stub:${input.tenantId}:${input.branchId}:${input.md5}`,
        providerEventId: `evt:${input.md5}:${Math.floor(now.getTime() / 1000)}`,
        providerTxHash: `tx:${input.md5}`,
        providerConfirmedAmount: input.expectedAmount,
        providerConfirmedCurrency: input.expectedCurrency,
        providerConfirmedToAccountId: input.expectedToAccountId,
        providerConfirmedAt: now,
        proofPayload: {
          provider: "STUB",
          md5: input.md5,
          amount: input.expectedAmount,
          currency: input.expectedCurrency,
          toAccountId: input.expectedToAccountId,
          confirmedAt: now.toISOString(),
        },
      };
    }

    if (status === "MISMATCH") {
      const mismatchCurrency = input.expectedCurrency === "USD" ? "KHR" : "USD";
      return {
        provider: "STUB",
        verificationStatus: "MISMATCH",
        reasonCode: "KHQR_PROOF_MISMATCH",
        providerReference: `stub:${input.tenantId}:${input.branchId}:${input.md5}`,
        providerEventId: `evt:${input.md5}:${Math.floor(now.getTime() / 1000)}`,
        providerTxHash: `tx:${input.md5}`,
        providerConfirmedAmount: Number((input.expectedAmount + 1).toFixed(2)),
        providerConfirmedCurrency: mismatchCurrency,
        providerConfirmedToAccountId: `${input.expectedToAccountId}:mismatch`,
        providerConfirmedAt: now,
        proofPayload: {
          provider: "STUB",
          md5: input.md5,
          mismatch: true,
          confirmedAt: now.toISOString(),
        },
      };
    }

    if (status === "EXPIRED") {
      return {
        provider: "STUB",
        verificationStatus: "EXPIRED",
        reasonCode: "KHQR_PAYMENT_EXPIRED",
        providerReference: `stub:${input.tenantId}:${input.branchId}:${input.md5}`,
        providerEventId: null,
        providerTxHash: null,
        providerConfirmedAmount: null,
        providerConfirmedCurrency: null,
        providerConfirmedToAccountId: null,
        providerConfirmedAt: null,
        proofPayload: {
          provider: "STUB",
          md5: input.md5,
          expired: true,
          checkedAt: now.toISOString(),
        },
      };
    }

    if (status === "NOT_FOUND") {
      return {
        provider: "STUB",
        verificationStatus: "NOT_FOUND",
        reasonCode: "KHQR_PAYMENT_NOT_FOUND",
        providerReference: null,
        providerEventId: null,
        providerTxHash: null,
        providerConfirmedAmount: null,
        providerConfirmedCurrency: null,
        providerConfirmedToAccountId: null,
        providerConfirmedAt: null,
        proofPayload: {
          provider: "STUB",
          md5: input.md5,
          notFound: true,
          checkedAt: now.toISOString(),
        },
      };
    }

    return {
      provider: "STUB",
      verificationStatus: "UNPAID",
      reasonCode: "KHQR_PAYMENT_NOT_CONFIRMED",
      providerReference: `stub:${input.tenantId}:${input.branchId}:${input.md5}`,
      providerEventId: null,
      providerTxHash: null,
      providerConfirmedAmount: null,
      providerConfirmedCurrency: null,
      providerConfirmedToAccountId: null,
      providerConfirmedAt: null,
      proofPayload: {
        provider: "STUB",
        md5: input.md5,
        unpaid: true,
        checkedAt: now.toISOString(),
      },
    };
  }

  parseWebhookEvent(input: {
    headers: Record<string, unknown>;
    body: Record<string, unknown>;
  }): V0KhqrWebhookEvent {
    const expectedSecret = normalizeOptionalString(process.env.V0_KHQR_WEBHOOK_SECRET)
      ?? "dev-khqr-webhook-secret";
    const incomingSecret = normalizeOptionalString(
      resolveHeaderValue(input.headers, "x-khqr-webhook-secret")
    );
    if (!incomingSecret || incomingSecret !== expectedSecret) {
      throw new V0KhqrProviderError(
        401,
        "KHQR_WEBHOOK_UNAUTHORIZED",
        "invalid webhook secret"
      );
    }

    const body = input.body;
    const verificationStatus = parseWebhookStatus(body.verificationStatus, "verificationStatus");
    const event: V0KhqrWebhookEvent = {
      provider: "BAKONG",
      tenantId: assertUuid(body.tenantId, "tenantId"),
      branchId: assertUuid(body.branchId, "branchId"),
      md5: assertMd5(body.md5, "md5"),
      providerEventId: normalizeOptionalString(body.providerEventId),
      providerTxHash: normalizeOptionalString(body.providerTxHash),
      providerReference: normalizeOptionalString(body.providerReference),
      verificationStatus,
      providerConfirmedAmount: parseOptionalPositiveAmount(body.confirmedAmount),
      providerConfirmedCurrency: parseOptionalCurrency(body.confirmedCurrency),
      providerConfirmedToAccountId: normalizeOptionalString(body.confirmedToAccountId),
      occurredAt: parseOptionalDate(body.occurredAt) ?? new Date(),
      proofPayload: body,
    };

    if (verificationStatus === "CONFIRMED") {
      if (
        event.providerConfirmedAmount === null ||
        event.providerConfirmedCurrency === null ||
        event.providerConfirmedToAccountId === null
      ) {
        throw new V0KhqrProviderError(
          422,
          "KHQR_WEBHOOK_PAYLOAD_INVALID",
          "confirmed webhook requires confirmedAmount, confirmedCurrency, and confirmedToAccountId"
        );
      }
    }

    return event;
  }
}

export function buildV0KhqrPaymentProviderFromEnv(): V0KhqrPaymentProvider {
  const providerName = String(process.env.V0_KHQR_PROVIDER ?? "stub")
    .trim()
    .toLowerCase();
  if (providerName === "stub") {
    return new StubV0KhqrPaymentProvider();
  }
  return new StubV0KhqrPaymentProvider();
}

function resolveStubStatus(md5: string): V0KhqrVerificationStatus {
  const fromEnv = String(process.env.V0_KHQR_STUB_VERIFICATION_STATUS ?? "")
    .trim()
    .toUpperCase();
  if (
    fromEnv === "CONFIRMED" ||
    fromEnv === "UNPAID" ||
    fromEnv === "MISMATCH" ||
    fromEnv === "EXPIRED" ||
    fromEnv === "NOT_FOUND"
  ) {
    return fromEnv;
  }

  const normalized = md5.toLowerCase();
  if (normalized.startsWith("33")) {
    return "CONFIRMED";
  }
  if (normalized.startsWith("22")) {
    return "MISMATCH";
  }
  if (normalized.startsWith("11")) {
    return "EXPIRED";
  }
  if (normalized.startsWith("00")) {
    return "NOT_FOUND";
  }
  return "UNPAID";
}

function parseWebhookStatus(
  value: unknown,
  fieldName: string
): V0KhqrWebhookVerificationStatus {
  const normalized = normalizeOptionalString(value)?.toUpperCase();
  if (
    normalized === "CONFIRMED" ||
    normalized === "UNPAID" ||
    normalized === "EXPIRED" ||
    normalized === "NOT_FOUND"
  ) {
    return normalized;
  }
  throw new V0KhqrProviderError(
    422,
    "KHQR_WEBHOOK_PAYLOAD_INVALID",
    `${fieldName} must be CONFIRMED | UNPAID | EXPIRED | NOT_FOUND`
  );
}

function parseOptionalPositiveAmount(value: unknown): number | null {
  if (value === undefined || value === null || String(value).trim().length === 0) {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new V0KhqrProviderError(
      422,
      "KHQR_WEBHOOK_PAYLOAD_INVALID",
      "confirmedAmount must be greater than 0"
    );
  }
  return Number(numeric.toFixed(2));
}

function parseOptionalCurrency(value: unknown): V0KhqrCurrency | null {
  const normalized = normalizeOptionalString(value)?.toUpperCase();
  if (!normalized) {
    return null;
  }
  if (normalized === "USD" || normalized === "KHR") {
    return normalized;
  }
  throw new V0KhqrProviderError(
    422,
    "KHQR_WEBHOOK_PAYLOAD_INVALID",
    "confirmedCurrency must be USD or KHR"
  );
}

function parseOptionalDate(value: unknown): Date | null {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new V0KhqrProviderError(
      422,
      "KHQR_WEBHOOK_PAYLOAD_INVALID",
      "occurredAt must be a valid ISO datetime"
    );
  }
  return parsed;
}

function resolveHeaderValue(
  headers: Record<string, unknown>,
  key: string
): string | null {
  const direct = headers[key];
  const lower = headers[key.toLowerCase()];
  const value = direct ?? lower;
  if (Array.isArray(value)) {
    return normalizeOptionalString(value[0] ?? null);
  }
  return normalizeOptionalString(value);
}

function assertUuid(value: unknown, fieldName: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized || !UUID_PATTERN.test(normalized)) {
    throw new V0KhqrProviderError(
      422,
      "KHQR_WEBHOOK_PAYLOAD_INVALID",
      `${fieldName} must be a valid UUID`
    );
  }
  return normalized;
}

function assertMd5(value: unknown, fieldName: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized || !MD5_PATTERN.test(normalized)) {
    throw new V0KhqrProviderError(
      422,
      "KHQR_WEBHOOK_PAYLOAD_INVALID",
      `${fieldName} must be a valid md5 hash`
    );
  }
  return normalized.toLowerCase();
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MD5_PATTERN = /^[0-9a-f]{32}$/i;
