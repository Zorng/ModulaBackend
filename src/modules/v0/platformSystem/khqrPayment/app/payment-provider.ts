import type {
  V0KhqrCurrency,
  V0KhqrProvider,
  V0KhqrVerificationStatus,
} from "../infra/repository.js";
import { createHash, randomUUID } from "crypto";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const bakongKhqr = require("bakong-khqr") as {
  BakongKHQR: new () => {
    generateIndividual(input: unknown): {
      status?: { code?: number; message?: string | null } | null;
      data?: { qr?: string | null; md5?: string | null } | null;
    };
  };
  IndividualInfo: new (
    bakongAccountID: string,
    merchantName: string,
    merchantCity: string,
    optional?: Record<string, unknown>
  ) => unknown;
  khqrData: {
    currency: {
      usd: unknown;
      khr: unknown;
    };
  };
};

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

export type V0KhqrGeneratedPaymentRequest = {
  provider: V0KhqrProvider;
  md5: string;
  providerReference: string | null;
  payload: string;
  payloadFormat: "RAW_TEXT";
  payloadType: "DEEPLINK_URL" | "EMV_KHQR_STRING" | "TEXT";
  deepLinkUrl: string | null;
  payloadHash: string;
};

export interface V0KhqrPaymentProvider {
  createPaymentRequest(input: {
    tenantId: string;
    branchId: string;
    saleId: string;
    amount: number;
    currency: V0KhqrCurrency;
    toAccountId: string;
    receiverName: string | null;
    expiresAt: Date | null;
  }): Promise<V0KhqrGeneratedPaymentRequest>;
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

type BakongHttpProviderConfig = {
  generateUrl: string | null;
  verifyUrl: string;
  timeoutMs: number;
  apiKey: string | null;
  apiKeyHeader: string;
  webhookSecret: string;
  webhookSecretHeader: string;
  enableSdkGeneration: boolean;
};

export type V0KhqrRuntimeDiagnostics = {
  provider: string;
  transport: "stub" | "bakong_http" | "unknown";
  isOfficialBakongOpenApi: boolean;
  generateMode: "stub" | "sdk" | "http" | "unavailable";
  baseUrlOrigin: string | null;
  baseUrlPath: string | null;
  generateUrlOrigin: string | null;
  generateUrlPath: string | null;
  verifyUrlOrigin: string | null;
  verifyUrlPath: string | null;
  timeoutMs: number | null;
  apiKeyConfigured: boolean;
  apiKeyHeader: string | null;
  apiKeyLength: number | null;
  apiKeyFingerprint: string | null;
  apiKeyUsesBearerPrefix: boolean | null;
  webhookSecretConfigured: boolean;
  webhookSecretHeader: string | null;
  suspectedIssues: string[];
};

class BakongHttpV0KhqrPaymentProvider implements V0KhqrPaymentProvider {
  constructor(private readonly config: BakongHttpProviderConfig) {}

  async createPaymentRequest(input: {
    tenantId: string;
    branchId: string;
    saleId: string;
    amount: number;
    currency: V0KhqrCurrency;
    toAccountId: string;
    receiverName: string | null;
    expiresAt: Date | null;
  }): Promise<V0KhqrGeneratedPaymentRequest> {
    const sdkGenerated = this.config.enableSdkGeneration
      ? generateKhqrWithBakongSdk(input)
      : null;
    const response = this.config.generateUrl
      ? await this.requestJson("generate", this.config.generateUrl, {
        tenantId: input.tenantId,
        branchId: input.branchId,
        saleId: input.saleId,
        amount: Number(input.amount.toFixed(2)),
        currency: input.currency,
        toAccountId: input.toAccountId,
        receiverName: input.receiverName,
        expiresAt: input.expiresAt?.toISOString() ?? null,
      })
      : null;
    const generatedFromResponse = response
      ? parseGeneratedResponse(response)
      : null;

    const payload = generatedFromResponse?.emvPayload ?? sdkGenerated?.payload ?? null;
    if (!payload) {
      throw new V0KhqrProviderError(
        503,
        "KHQR_PROVIDER_UNAVAILABLE",
        "provider generate response missing EMV KHQR payload"
      );
    }

    const md5 = assertMd5(
      generatedFromResponse?.md5
      ?? sdkGenerated?.md5
      ?? createHash("md5").update(payload).digest("hex"),
      "md5"
    );
    const payloadFormat = normalizeOptionalString(response?.payloadFormat)?.toUpperCase();
    if (payloadFormat && payloadFormat !== "RAW_TEXT") {
      throw new V0KhqrProviderError(
        503,
        "KHQR_PROVIDER_UNAVAILABLE",
        "provider generate response payloadFormat is unsupported"
      );
    }

    return {
      provider: "BAKONG",
      md5,
      providerReference: normalizeOptionalString(response?.providerReference),
      payload,
      payloadFormat: "RAW_TEXT",
      payloadType: detectKhqrPayloadType(payload),
      deepLinkUrl: generatedFromResponse?.deepLinkUrl ?? null,
      payloadHash:
        normalizeOptionalString(response?.payloadHash)
        ?? createHash("sha256").update(payload).digest("hex"),
    };
  }

  async verifyByMd5(input: {
    tenantId: string;
    branchId: string;
    md5: string;
    expectedAmount: number;
    expectedCurrency: V0KhqrCurrency;
    expectedToAccountId: string;
  }): Promise<V0KhqrVerificationResult> {
    const rawResponse = await this.requestJson("verify", this.config.verifyUrl, {
      tenantId: input.tenantId,
      branchId: input.branchId,
      md5: input.md5,
      expectedAmount: Number(input.expectedAmount.toFixed(2)),
      expectedCurrency: input.expectedCurrency,
      expectedToAccountId: input.expectedToAccountId,
    });
    const response = normalizeVerifyResponse(rawResponse);

    const verificationStatus = parseVerificationStatus(
      response.verificationStatus,
      "verificationStatus"
    );
    const providerConfirmedAmount = parseOptionalPositiveAmountFromProvider(
      response.providerConfirmedAmount ?? response.confirmedAmount
    );
    const providerConfirmedCurrency = parseOptionalCurrencyFromProvider(
      response.providerConfirmedCurrency ?? response.confirmedCurrency
    );
    const providerConfirmedToAccountId = normalizeOptionalString(
      response.providerConfirmedToAccountId ?? response.confirmedToAccountId
    );
    const providerConfirmedAt = parseOptionalDateFromProvider(
      response.providerConfirmedAt ?? response.confirmedAt
    );

    const hasConfirmedShape =
      providerConfirmedAmount !== null &&
      providerConfirmedCurrency !== null &&
      providerConfirmedToAccountId !== null;
    if (verificationStatus === "CONFIRMED" && !hasConfirmedShape) {
      return {
        provider: "BAKONG",
        verificationStatus: "MISMATCH",
        reasonCode: "KHQR_PROVIDER_CONFIRMATION_INCOMPLETE",
        providerReference: normalizeOptionalString(response.providerReference),
        providerEventId: normalizeOptionalString(response.providerEventId),
        providerTxHash: normalizeOptionalString(response.providerTxHash),
        providerConfirmedAmount,
        providerConfirmedCurrency,
        providerConfirmedToAccountId,
        providerConfirmedAt,
        proofPayload: normalizeOptionalRecord(response.proofPayload) ?? response,
      };
    }

    return {
      provider: "BAKONG",
      verificationStatus,
      reasonCode: normalizeOptionalString(response.reasonCode),
      providerReference: normalizeOptionalString(response.providerReference),
      providerEventId: normalizeOptionalString(response.providerEventId),
      providerTxHash: normalizeOptionalString(response.providerTxHash),
      providerConfirmedAmount,
      providerConfirmedCurrency,
      providerConfirmedToAccountId,
      providerConfirmedAt,
      proofPayload: normalizeOptionalRecord(response.proofPayload) ?? response,
    };
  }

  parseWebhookEvent(input: {
    headers: Record<string, unknown>;
    body: Record<string, unknown>;
  }): V0KhqrWebhookEvent {
    const incomingSecret = normalizeOptionalString(
      resolveHeaderValue(input.headers, this.config.webhookSecretHeader)
    );
    if (!incomingSecret || incomingSecret !== this.config.webhookSecret) {
      throw new V0KhqrProviderError(
        401,
        "KHQR_WEBHOOK_UNAUTHORIZED",
        "invalid webhook secret"
      );
    }

    return parseWebhookEventBody(input.body);
  }

  private async requestJson(
    op: "generate" | "verify",
    url: string,
    payload: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (this.config.apiKey) {
        const normalizedHeader = this.config.apiKeyHeader.toLowerCase();
        if (normalizedHeader === "authorization") {
          const normalizedToken = this.config.apiKey.trim();
          headers[this.config.apiKeyHeader] = normalizedToken.toLowerCase().startsWith("bearer ")
            ? normalizedToken
            : `Bearer ${normalizedToken}`;
        } else {
          headers[this.config.apiKeyHeader] = this.config.apiKey;
        }
      }
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const text = await response.text();
      const contentType = normalizeOptionalString(response.headers.get("content-type"));
      let body: Record<string, unknown> = {};
      try {
        body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        throw new V0KhqrProviderError(
          503,
          "KHQR_PROVIDER_UNAVAILABLE",
          `provider ${op} response is not valid JSON (status ${response.status}, content-type ${contentType ?? "unknown"}, body ${summarizeProviderResponsePreview(text)})`
        );
      }
      if (!response.ok) {
        throw new V0KhqrProviderError(
          503,
          "KHQR_PROVIDER_UNAVAILABLE",
          normalizeOptionalString(body.error)
          ?? normalizeOptionalString(body.message)
          ?? `provider ${op} failed with status ${response.status}`
        );
      }
      return body;
    } catch (error) {
      if (error instanceof V0KhqrProviderError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new V0KhqrProviderError(
          503,
          "KHQR_PROVIDER_UNAVAILABLE",
          `provider ${op} request timed out`
        );
      }
      throw new V0KhqrProviderError(
        503,
        "KHQR_PROVIDER_UNAVAILABLE",
        error instanceof Error ? error.message : `provider ${op} failed`
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class StubV0KhqrPaymentProvider implements V0KhqrPaymentProvider {
  async createPaymentRequest(input: {
    tenantId: string;
    branchId: string;
    saleId: string;
    amount: number;
    currency: V0KhqrCurrency;
    toAccountId: string;
    receiverName: string | null;
    expiresAt: Date | null;
  }): Promise<V0KhqrGeneratedPaymentRequest> {
    const nonce = randomUUID();
    const seed = [
      input.tenantId,
      input.branchId,
      input.saleId,
      input.amount.toFixed(2),
      input.currency,
      input.toAccountId,
      input.expiresAt?.toISOString() ?? "",
      nonce,
    ].join("|");
    const md5 = createHash("md5").update(seed).digest("hex");
    const query = new URLSearchParams({
      provider: "stub",
      md5,
      amount: input.amount.toFixed(2),
      currency: input.currency,
      toAccountId: input.toAccountId,
      saleId: input.saleId,
      tenantId: input.tenantId,
      branchId: input.branchId,
      ...(input.receiverName ? { receiverName: input.receiverName } : {}),
      ...(input.expiresAt ? { expiresAt: input.expiresAt.toISOString() } : {}),
    });
    const payload = `khqr://stub/request?${query.toString()}`;
    return {
      provider: "STUB",
      md5,
      providerReference: `stub:${input.tenantId}:${input.branchId}:${input.saleId}:${md5}`,
      payload,
      payloadFormat: "RAW_TEXT",
      payloadType: detectKhqrPayloadType(payload),
      deepLinkUrl: payload,
      payloadHash: createHash("sha256").update(payload).digest("hex"),
    };
  }

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

    return parseWebhookEventBody(input.body);
  }
}

export function buildV0KhqrPaymentProviderFromEnv(): V0KhqrPaymentProvider {
  const providerName = String(process.env.V0_KHQR_PROVIDER ?? "stub")
    .trim()
    .toLowerCase();
  if (providerName === "stub") {
    return new StubV0KhqrPaymentProvider();
  }
  if (providerName === "bakong" || providerName === "bakong_http") {
    return new BakongHttpV0KhqrPaymentProvider(buildBakongHttpProviderConfig());
  }
  throw new Error(`Unsupported V0_KHQR_PROVIDER: ${providerName}`);
}

export function getV0KhqrRuntimeDiagnosticsFromEnv(): V0KhqrRuntimeDiagnostics {
  const providerName = String(process.env.V0_KHQR_PROVIDER ?? "stub")
    .trim()
    .toLowerCase();

  if (providerName === "stub") {
    return {
      provider: providerName,
      transport: "stub",
      isOfficialBakongOpenApi: false,
      generateMode: "stub",
      baseUrlOrigin: null,
      baseUrlPath: null,
      generateUrlOrigin: null,
      generateUrlPath: null,
      verifyUrlOrigin: null,
      verifyUrlPath: null,
      timeoutMs: null,
      apiKeyConfigured: false,
      apiKeyHeader: null,
      apiKeyLength: null,
      apiKeyFingerprint: null,
      apiKeyUsesBearerPrefix: null,
      webhookSecretConfigured: Boolean(
        normalizeOptionalString(process.env.V0_KHQR_WEBHOOK_SECRET)
      ),
      webhookSecretHeader:
        normalizeOptionalString(process.env.V0_KHQR_WEBHOOK_SECRET_HEADER)
        ?? "x-khqr-webhook-secret",
      suspectedIssues: [],
    };
  }

  if (providerName !== "bakong" && providerName !== "bakong_http") {
    return {
      provider: providerName,
      transport: "unknown",
      isOfficialBakongOpenApi: false,
      generateMode: "unavailable",
      baseUrlOrigin: null,
      baseUrlPath: null,
      generateUrlOrigin: null,
      generateUrlPath: null,
      verifyUrlOrigin: null,
      verifyUrlPath: null,
      timeoutMs: null,
      apiKeyConfigured: false,
      apiKeyHeader: null,
      apiKeyLength: null,
      apiKeyFingerprint: null,
      apiKeyUsesBearerPrefix: null,
      webhookSecretConfigured: Boolean(
        normalizeOptionalString(process.env.V0_KHQR_WEBHOOK_SECRET)
      ),
      webhookSecretHeader:
        normalizeOptionalString(process.env.V0_KHQR_WEBHOOK_SECRET_HEADER)
        ?? "x-khqr-webhook-secret",
      suspectedIssues: ["UNSUPPORTED_PROVIDER"],
    };
  }

  const baseUrl = normalizeOptionalString(process.env.V0_KHQR_PROVIDER_BASE_URL);
  const isOfficialBakongOpenApi = Boolean(baseUrl?.includes("api-bakong.nbc.gov.kh"));
  const enableSdkGeneration = parseBooleanWithDefault(
    process.env.V0_KHQR_ENABLE_SDK_GENERATION,
    isOfficialBakongOpenApi
  );
  const defaultApiKeyHeader = isOfficialBakongOpenApi ? "authorization" : "x-api-key";
  const configuredApiKeyHeader =
    normalizeOptionalString(process.env.V0_KHQR_PROVIDER_API_KEY_HEADER)
    ?? defaultApiKeyHeader;
  const apiKey = normalizeOptionalString(process.env.V0_KHQR_PROVIDER_API_KEY);
  const webhookSecret = normalizeOptionalString(process.env.V0_KHQR_WEBHOOK_SECRET);
  const timeoutMs = Number.parseInt(String(process.env.V0_KHQR_PROVIDER_TIMEOUT_MS ?? "5000"), 10);
  const normalizedTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000;
  const generateUrl =
    normalizeOptionalString(process.env.V0_KHQR_PROVIDER_GENERATE_URL)
    ?? (!enableSdkGeneration && baseUrl ? `${baseUrl.replace(/\/+$/, "")}/khqr/generate` : null);
  const verifyUrl =
    normalizeOptionalString(process.env.V0_KHQR_PROVIDER_VERIFY_URL)
    ?? (
      baseUrl
        ? (
          isOfficialBakongOpenApi
            ? `${baseUrl.replace(/\/+$/, "")}/check_transaction_by_md5`
            : `${baseUrl.replace(/\/+$/, "")}/khqr/verify`
        )
        : null
    );

  const suspectedIssues: string[] = [];
  if (!baseUrl && !verifyUrl) {
    suspectedIssues.push("VERIFY_URL_MISSING");
  }
  if (!apiKey) {
    suspectedIssues.push("API_KEY_MISSING");
  } else {
    if (looksLikePlaceholderSecret(apiKey)) {
      suspectedIssues.push("API_KEY_PLACEHOLDER_LIKE");
    }
    if (isOfficialBakongOpenApi && configuredApiKeyHeader.toLowerCase() !== "authorization") {
      suspectedIssues.push("API_KEY_HEADER_UNEXPECTED");
    }
  }
  if (!webhookSecret) {
    suspectedIssues.push("WEBHOOK_SECRET_MISSING");
  } else if (looksLikePlaceholderSecret(webhookSecret)) {
    suspectedIssues.push("WEBHOOK_SECRET_PLACEHOLDER_LIKE");
  }

  return {
    provider: providerName,
    transport: "bakong_http",
    isOfficialBakongOpenApi,
    generateMode: enableSdkGeneration ? "sdk" : generateUrl ? "http" : "unavailable",
    baseUrlOrigin: summarizeUrl(baseUrl)?.origin ?? null,
    baseUrlPath: summarizeUrl(baseUrl)?.path ?? null,
    generateUrlOrigin: summarizeUrl(generateUrl)?.origin ?? null,
    generateUrlPath: summarizeUrl(generateUrl)?.path ?? null,
    verifyUrlOrigin: summarizeUrl(verifyUrl)?.origin ?? null,
    verifyUrlPath: summarizeUrl(verifyUrl)?.path ?? null,
    timeoutMs: normalizedTimeoutMs,
    apiKeyConfigured: Boolean(apiKey),
    apiKeyHeader: configuredApiKeyHeader,
    apiKeyLength: apiKey?.length ?? null,
    apiKeyFingerprint: apiKey ? createHash("sha256").update(apiKey).digest("hex").slice(0, 12) : null,
    apiKeyUsesBearerPrefix: apiKey ? apiKey.toLowerCase().startsWith("bearer ") : null,
    webhookSecretConfigured: Boolean(webhookSecret),
    webhookSecretHeader:
      normalizeOptionalString(process.env.V0_KHQR_WEBHOOK_SECRET_HEADER)
      ?? "x-khqr-webhook-secret",
    suspectedIssues,
  };
}

function buildBakongHttpProviderConfig(): BakongHttpProviderConfig {
  const baseUrl = normalizeOptionalString(process.env.V0_KHQR_PROVIDER_BASE_URL);
  const isOfficialBakongOpenApi = Boolean(baseUrl?.includes("api-bakong.nbc.gov.kh"));
  const enableSdkGeneration = parseBooleanWithDefault(
    process.env.V0_KHQR_ENABLE_SDK_GENERATION,
    isOfficialBakongOpenApi
  );
  const generateUrl =
    normalizeOptionalString(process.env.V0_KHQR_PROVIDER_GENERATE_URL)
    ?? (!enableSdkGeneration && baseUrl ? `${baseUrl.replace(/\/+$/, "")}/khqr/generate` : null);
  const verifyUrl =
    normalizeOptionalString(process.env.V0_KHQR_PROVIDER_VERIFY_URL)
    ?? (
      baseUrl
        ? (
          isOfficialBakongOpenApi
            ? `${baseUrl.replace(/\/+$/, "")}/check_transaction_by_md5`
            : `${baseUrl.replace(/\/+$/, "")}/khqr/verify`
        )
        : null
    );
  if (!verifyUrl) {
    throw new Error(
      "KHQR provider is not configured: set V0_KHQR_PROVIDER_BASE_URL or V0_KHQR_PROVIDER_VERIFY_URL"
    );
  }

  const timeoutMs = Number.parseInt(
    String(process.env.V0_KHQR_PROVIDER_TIMEOUT_MS ?? "5000"),
    10
  );
  const normalizedTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000;
  const webhookSecret = normalizeOptionalString(process.env.V0_KHQR_WEBHOOK_SECRET)
    ?? "dev-khqr-webhook-secret";
  const webhookSecretHeader =
    normalizeOptionalString(process.env.V0_KHQR_WEBHOOK_SECRET_HEADER)
    ?? "x-khqr-webhook-secret";
  const defaultApiKeyHeader = isOfficialBakongOpenApi ? "authorization" : "x-api-key";

  return {
    generateUrl,
    verifyUrl,
    timeoutMs: normalizedTimeoutMs,
    apiKey: normalizeOptionalString(process.env.V0_KHQR_PROVIDER_API_KEY),
    apiKeyHeader:
      normalizeOptionalString(process.env.V0_KHQR_PROVIDER_API_KEY_HEADER)
      ?? defaultApiKeyHeader,
    webhookSecret,
    webhookSecretHeader,
    enableSdkGeneration,
  };
}

function summarizeProviderResponsePreview(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "<empty>";
  }
  if (normalized.length <= 160) {
    return JSON.stringify(normalized);
  }
  return `${JSON.stringify(normalized.slice(0, 160))}...`;
}

function summarizeUrl(rawUrl: string | null): { origin: string; path: string } | null {
  if (!rawUrl) {
    return null;
  }

  try {
    const parsed = new URL(rawUrl);
    return {
      origin: parsed.origin,
      path: parsed.pathname || "/",
    };
  } catch {
    return null;
  }
}

function looksLikePlaceholderSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "token"
    || normalized === "secret"
    || normalized === "your-secret-for-development"
    || normalized === "changeme"
    || normalized === "your-api-key"
    || normalized.length < 16
  );
}

function parseBooleanWithDefault(value: unknown, fallback: boolean): boolean {
  const normalized = normalizeOptionalString(value)?.toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }
  return fallback;
}

function parseGeneratedResponse(response: Record<string, unknown>): {
  md5: string | null;
  emvPayload: string | null;
  deepLinkUrl: string | null;
} {
  const candidateEmv = firstNonEmptyString([
    response.emvPayload,
    response.khqrPayload,
    response.khqrString,
    response.qr,
    response.payload,
  ]);
  const emvPayload = candidateEmv && looksLikeEmvKhqrPayload(candidateEmv)
    ? candidateEmv
    : null;

  const candidateDeepLink = firstNonEmptyString([
    response.deepLinkUrl,
    response.deep_link_url,
    response.deeplinkUrl,
    response.deeplink,
    response.url,
    response.payload,
  ]);
  const deepLinkUrl = candidateDeepLink && looksLikeUrl(candidateDeepLink)
    ? candidateDeepLink
    : null;

  return {
    md5: normalizeOptionalString(response.md5),
    emvPayload,
    deepLinkUrl,
  };
}

function normalizeVerifyResponse(
  response: Record<string, unknown>
): Record<string, unknown> {
  const explicitStatus = normalizeOptionalString(response.verificationStatus)?.toUpperCase();
  if (
    explicitStatus === "CONFIRMED" ||
    explicitStatus === "UNPAID" ||
    explicitStatus === "MISMATCH" ||
    explicitStatus === "EXPIRED" ||
    explicitStatus === "NOT_FOUND"
  ) {
    return {
      ...response,
      verificationStatus: explicitStatus,
    };
  }

  const responseCode = Number(response.responseCode);
  const data = normalizeOptionalRecord(response.data);
  if (Number.isFinite(responseCode) && responseCode === 0 && data) {
    return {
      ...response,
      verificationStatus: "CONFIRMED",
      providerTxHash: normalizeOptionalString(data.hash),
      providerReference:
        normalizeOptionalString(data.externalRef)
        ?? normalizeOptionalString(data.instructionRef),
      providerConfirmedAmount: data.amount ?? null,
      providerConfirmedCurrency: data.currency ?? null,
      providerConfirmedToAccountId: data.toAccountId ?? null,
      providerConfirmedAt:
        toIsoStringFromEpochMs(data.acknowledgedDateMs)
        ?? toIsoStringFromEpochMs(data.createdDateMs),
      proofPayload: response,
    };
  }

  const rawErrorCode = normalizeOptionalString(response.errorCode);
  const rawMessage =
    normalizeOptionalString(response.responseMessage)
    ?? normalizeOptionalString(response.message);
  const isNotFound = Boolean(
    rawErrorCode?.toUpperCase().includes("NOT_FOUND")
    || rawMessage?.toUpperCase().includes("NOT FOUND")
  );

  return {
    ...response,
    verificationStatus: isNotFound ? "NOT_FOUND" : "UNPAID",
    reasonCode: rawErrorCode ?? rawMessage,
    proofPayload: response,
  };
}

function firstNonEmptyString(values: unknown[]): string | null {
  for (const value of values) {
    const normalized = normalizeOptionalString(value);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function toIsoStringFromEpochMs(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const parsed = new Date(numeric);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function generateKhqrWithBakongSdk(input: {
  amount: number;
  currency: V0KhqrCurrency;
  toAccountId: string;
  receiverName: string | null;
  expiresAt: Date | null;
}): {
  payload: string;
  md5: string;
} {
  const merchantName = sanitizeMerchantName(input.receiverName, input.toAccountId);
  const optionalData: Record<string, unknown> = {
    currency: input.currency === "USD"
      ? bakongKhqr.khqrData.currency.usd
      : bakongKhqr.khqrData.currency.khr,
    amount: Number(input.amount.toFixed(2)),
    merchantCategoryCode: "5999",
    expirationTimestamp: (input.expiresAt ?? new Date(Date.now() + 5 * 60 * 1000)).getTime(),
  };

  const info = new bakongKhqr.IndividualInfo(
    input.toAccountId,
    merchantName,
    "Phnom Penh",
    optionalData
  );
  const generator = new bakongKhqr.BakongKHQR();
  const result = generator.generateIndividual(info);
  if (
    !result
    || result.status?.code !== 0
    || !result.data
    || !normalizeOptionalString(result.data.qr)
  ) {
    throw new V0KhqrProviderError(
      503,
      "KHQR_PROVIDER_UNAVAILABLE",
      `bakong sdk failed to generate emv payload${result?.status?.message ? `: ${result.status.message}` : ""}`
    );
  }

  const payload = normalizeOptionalString(result.data.qr)!;
  const md5 = assertMd5(
    normalizeOptionalString(result.data.md5)
    ?? createHash("md5").update(payload).digest("hex"),
    "md5"
  );
  return { payload, md5 };
}

function sanitizeMerchantName(receiverName: string | null, fallbackAccountId: string): string {
  const raw = normalizeOptionalString(receiverName)
    ?? normalizeOptionalString(fallbackAccountId)
    ?? "MODULA";
  return raw
    .replace(/[^\p{L}\p{N}\s.\-@_]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 25);
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

function detectKhqrPayloadType(payload: string): "DEEPLINK_URL" | "EMV_KHQR_STRING" | "TEXT" {
  if (looksLikeEmvKhqrPayload(payload)) {
    return "EMV_KHQR_STRING";
  }
  if (looksLikeUrl(payload)) {
    return "DEEPLINK_URL";
  }
  return "TEXT";
}

function looksLikeEmvKhqrPayload(payload: string): boolean {
  const normalized = payload.trim();
  if (normalized.length < 24) {
    return false;
  }
  if (!normalized.startsWith("000201")) {
    return false;
  }
  const checksumTagIndex = normalized.lastIndexOf("6304");
  if (checksumTagIndex < 0 || checksumTagIndex + 8 !== normalized.length) {
    return false;
  }
  const checksum = normalized.slice(-4);
  return /^[0-9A-Fa-f]{4}$/.test(checksum);
}

function looksLikeUrl(payload: string): boolean {
  const normalized = payload.trim();
  try {
    const parsed = new URL(normalized);
    return parsed.protocol.length > 1;
  } catch {
    return false;
  }
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

function parseVerificationStatus(
  value: unknown,
  fieldName: string
): V0KhqrVerificationStatus {
  const normalized = normalizeOptionalString(value)?.toUpperCase();
  if (
    normalized === "CONFIRMED" ||
    normalized === "UNPAID" ||
    normalized === "MISMATCH" ||
    normalized === "EXPIRED" ||
    normalized === "NOT_FOUND"
  ) {
    return normalized;
  }
  throw new V0KhqrProviderError(
    503,
    "KHQR_PROVIDER_UNAVAILABLE",
    `${fieldName} must be CONFIRMED | UNPAID | MISMATCH | EXPIRED | NOT_FOUND`
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

function parseOptionalPositiveAmountFromProvider(value: unknown): number | null {
  if (value === undefined || value === null || String(value).trim().length === 0) {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new V0KhqrProviderError(
      503,
      "KHQR_PROVIDER_UNAVAILABLE",
      "providerConfirmedAmount must be greater than 0"
    );
  }
  return Number(numeric.toFixed(2));
}

function parseOptionalCurrencyFromProvider(value: unknown): V0KhqrCurrency | null {
  const normalized = normalizeOptionalString(value)?.toUpperCase();
  if (!normalized) {
    return null;
  }
  if (normalized === "USD" || normalized === "KHR") {
    return normalized;
  }
  throw new V0KhqrProviderError(
    503,
    "KHQR_PROVIDER_UNAVAILABLE",
    "providerConfirmedCurrency must be USD or KHR"
  );
}

function parseOptionalDateFromProvider(value: unknown): Date | null {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new V0KhqrProviderError(
      503,
      "KHQR_PROVIDER_UNAVAILABLE",
      "providerConfirmedAt must be a valid ISO datetime"
    );
  }
  return parsed;
}

function normalizeOptionalRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
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

function parseWebhookEventBody(body: Record<string, unknown>): V0KhqrWebhookEvent {
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
