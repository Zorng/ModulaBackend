import { afterEach, describe, expect, it, jest } from "@jest/globals";
import {
  V0KhqrProviderError,
  buildV0KhqrPaymentProviderFromEnv,
} from "../../app/payment-provider.js";

describe("khqr payment provider builder", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it("builds bakong http provider and performs generate+verify", async () => {
    process.env.V0_KHQR_PROVIDER = "bakong";
    process.env.V0_KHQR_PROVIDER_BASE_URL = "https://pay.example.com";
    process.env.V0_KHQR_WEBHOOK_SECRET = "secret";

    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            md5: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            emvPayload:
              "00020101021229230019ieangzorng_lim@bkrt52045999530384054043.505802KH5911Main Branch6010Phnom Penh63043DFA",
            payload: "khqr://real/request",
            payloadFormat: "RAW_TEXT",
            payloadHash: "hash",
            providerReference: "ref-1",
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            responseCode: 0,
            responseMessage: "Success",
            errorCode: null,
            data: {
              hash: "tx-1",
              fromAccountId: "payer@abaa",
              toAccountId: "bakong-account-id",
              currency: "USD",
              amount: 3.5,
              createdDateMs: 1771545600000,
              acknowledgedDateMs: 1771545601000,
              externalRef: "ref-1",
            },
          }),
          { status: 200 }
        )
      );

    const provider = buildV0KhqrPaymentProviderFromEnv();
    const generated = await provider.createPaymentRequest({
      tenantId: "10000000-0000-4000-8000-000000000001",
      branchId: "10000000-0000-4000-8000-000000000002",
      saleId: "10000000-0000-4000-8000-000000000003",
      amount: 3.5,
      currency: "USD",
      toAccountId: "bakong-account-id",
      receiverName: "Main Branch Receiver",
      expiresAt: new Date("2026-02-20T01:00:00.000Z"),
    });

    expect(generated.provider).toBe("BAKONG");
    expect(generated.md5).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(generated.payload.startsWith("000201")).toBe(true);
    expect(generated.payloadType).toBe("EMV_KHQR_STRING");
    expect(generated.deepLinkUrl).toBe("khqr://real/request");

    const verified = await provider.verifyByMd5({
      tenantId: "10000000-0000-4000-8000-000000000001",
      branchId: "10000000-0000-4000-8000-000000000002",
      md5: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      expectedAmount: 3.5,
      expectedCurrency: "USD",
      expectedToAccountId: "bakong-account-id",
    });

    expect(verified.verificationStatus).toBe("CONFIRMED");
    expect(verified.providerConfirmedAmount).toBe(3.5);
    expect(verified.providerConfirmedCurrency).toBe("USD");
    expect(verified.providerConfirmedToAccountId).toBe("bakong-account-id");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("routes verify through configured proxy with shared secret", async () => {
    process.env.V0_KHQR_PROVIDER = "bakong";
    process.env.V0_KHQR_PROVIDER_BASE_URL = "https://api-bakong.nbc.gov.kh/v1";
    process.env.V0_KHQR_WEBHOOK_SECRET = "secret";
    process.env.V0_KHQR_PROVIDER_API_KEY = "bakong-api-key";
    process.env.V0_KHQR_PROVIDER_VERIFY_PROXY_URL = "https://relay.example.com/verify";
    process.env.V0_KHQR_PROVIDER_VERIFY_PROXY_SECRET = "relay-secret";

    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          responseCode: 0,
          responseMessage: "Success",
          errorCode: null,
          data: {
            hash: "tx-1",
            toAccountId: "bakong-account-id",
            currency: "USD",
            amount: 3.5,
            createdDateMs: 1771545600000,
            acknowledgedDateMs: 1771545601000,
            externalRef: "ref-1",
          },
        }),
        { status: 200 }
      )
    );

    const provider = buildV0KhqrPaymentProviderFromEnv();
    const verified = await provider.verifyByMd5({
      tenantId: "10000000-0000-4000-8000-000000000001",
      branchId: "10000000-0000-4000-8000-000000000002",
      md5: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      expectedAmount: 3.5,
      expectedCurrency: "USD",
      expectedToAccountId: "bakong-account-id",
    });

    expect(verified.verificationStatus).toBe("CONFIRMED");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://relay.example.com/verify",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "x-khqr-verify-proxy-secret": "relay-secret",
        }),
        body: JSON.stringify({
          md5: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        }),
      })
    );
  });

  it("fails fast when bakong provider is missing endpoint config", () => {
    process.env.V0_KHQR_PROVIDER = "bakong";
    delete process.env.V0_KHQR_PROVIDER_BASE_URL;
    delete process.env.V0_KHQR_PROVIDER_GENERATE_URL;
    delete process.env.V0_KHQR_PROVIDER_VERIFY_URL;

    expect(() => buildV0KhqrPaymentProviderFromEnv()).toThrow("KHQR provider is not configured");
  });

  it("fails fast when verify proxy is configured without proxy secret", () => {
    process.env.V0_KHQR_PROVIDER = "bakong";
    process.env.V0_KHQR_PROVIDER_BASE_URL = "https://api-bakong.nbc.gov.kh/v1";
    process.env.V0_KHQR_PROVIDER_VERIFY_PROXY_URL = "https://relay.example.com/verify";
    delete process.env.V0_KHQR_PROVIDER_VERIFY_PROXY_SECRET;

    expect(() => buildV0KhqrPaymentProviderFromEnv()).toThrow(
      "KHQR verify proxy is not configured"
    );
  });

  it("rejects webhook when secret header is invalid", () => {
    process.env.V0_KHQR_PROVIDER = "bakong";
    process.env.V0_KHQR_PROVIDER_BASE_URL = "https://pay.example.com";
    process.env.V0_KHQR_WEBHOOK_SECRET = "expected";

    const provider = buildV0KhqrPaymentProviderFromEnv();
    expect(() =>
      provider.parseWebhookEvent({
        headers: { "x-khqr-webhook-secret": "wrong" },
        body: {},
      })
    ).toThrow(V0KhqrProviderError);
  });

  it("tags EMV string payload as EMV_KHQR_STRING", async () => {
    process.env.V0_KHQR_PROVIDER = "bakong";
    process.env.V0_KHQR_PROVIDER_BASE_URL = "https://pay.example.com";
    process.env.V0_KHQR_WEBHOOK_SECRET = "secret";

    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          md5: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          payload:
            "00020101021226430016modula.khqr.stub0119ieangzorng_lim@bkrt52045999530384054043.505802KH5911MODULA STUB6010PHNOM PENH62120108sale-12363044AB9",
          payloadFormat: "RAW_TEXT",
        }),
        { status: 200 }
      )
    );

    const provider = buildV0KhqrPaymentProviderFromEnv();
    const generated = await provider.createPaymentRequest({
      tenantId: "10000000-0000-4000-8000-000000000001",
      branchId: "10000000-0000-4000-8000-000000000002",
      saleId: "10000000-0000-4000-8000-000000000003",
      amount: 3.5,
      currency: "USD",
      toAccountId: "bakong-account-id",
      receiverName: "Main Branch Receiver",
      expiresAt: null,
    });

    expect(generated.payloadType).toBe("EMV_KHQR_STRING");
  });

  it("maps bakong verify not-found payload without verificationStatus", async () => {
    process.env.V0_KHQR_PROVIDER = "bakong";
    process.env.V0_KHQR_PROVIDER_BASE_URL = "https://pay.example.com";
    process.env.V0_KHQR_WEBHOOK_SECRET = "secret";

    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          responseCode: 1001,
          responseMessage: "Transaction not found",
          errorCode: "TRANSACTION_NOT_FOUND",
        }),
        { status: 200 }
      )
    );

    const provider = buildV0KhqrPaymentProviderFromEnv();
    const verified = await provider.verifyByMd5({
      tenantId: "10000000-0000-4000-8000-000000000001",
      branchId: "10000000-0000-4000-8000-000000000002",
      md5: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      expectedAmount: 3.5,
      expectedCurrency: "USD",
      expectedToAccountId: "bakong-account-id",
    });

    expect(verified.verificationStatus).toBe("NOT_FOUND");
    expect(verified.reasonCode).toBe("TRANSACTION_NOT_FOUND");
  });

  it("includes status and content-type when verify response is not JSON", async () => {
    process.env.V0_KHQR_PROVIDER = "bakong";
    process.env.V0_KHQR_PROVIDER_BASE_URL = "https://pay.example.com";
    process.env.V0_KHQR_WEBHOOK_SECRET = "secret";

    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("<html>bad gateway</html>", {
        status: 502,
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    );

    const provider = buildV0KhqrPaymentProviderFromEnv();

    await expect(
      provider.verifyByMd5({
        tenantId: "10000000-0000-4000-8000-000000000001",
        branchId: "10000000-0000-4000-8000-000000000002",
        md5: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        expectedAmount: 3.5,
        expectedCurrency: "USD",
        expectedToAccountId: "bakong-account-id",
      })
    ).rejects.toThrow(
      "provider verify response is not valid JSON (status 502, content-type text/html; charset=utf-8"
    );
  });

  it("generates EMV payload locally with Bakong SDK when official base URL is used", async () => {
    process.env.V0_KHQR_PROVIDER = "bakong";
    process.env.V0_KHQR_PROVIDER_BASE_URL = "https://api-bakong.nbc.gov.kh/v1";

    const fetchMock = jest.spyOn(globalThis, "fetch");
    const provider = buildV0KhqrPaymentProviderFromEnv();
    const generated = await provider.createPaymentRequest({
      tenantId: "10000000-0000-4000-8000-000000000001",
      branchId: "10000000-0000-4000-8000-000000000002",
      saleId: "10000000-0000-4000-8000-000000000003",
      amount: 3.5,
      currency: "USD",
      toAccountId: "ieangzorng_lim@bkrt",
      receiverName: "Main Branch",
      expiresAt: null,
    });

    expect(generated.payload.startsWith("000201")).toBe(true);
    expect(generated.payloadType).toBe("EMV_KHQR_STRING");
    expect(generated.deepLinkUrl).toBe(null);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });
});
