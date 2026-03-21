import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { V0AuthAccountService } from "../../app/auth-account.service.js";

describe("v0 auth account service fixed OTP policy", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it("accepts fixed OTP fallback in staging when explicitly enabled", async () => {
    process.env.V0_AUTH_PROVIDER = "supabase";
    process.env.APP_ENV = "staging";
    process.env.V0_AUTH_FIXED_OTP_ENABLED = "true";
    process.env.AUTH_FIXED_OTP = "123456";

    const repo = {
      findAccountByPhone: jest.fn().mockResolvedValue({
        id: "acc-1",
        supabase_user_id: "supabase-user-1",
        phone: "+85512345678",
        phone_verified_at: null,
      }),
      markPhoneVerifiedByAccountId: jest.fn().mockResolvedValue(undefined),
      createAuditEvent: jest.fn().mockResolvedValue(undefined),
    } as any;

    const service = new V0AuthAccountService(repo);
    const result = await service.verifyRegistrationOtp({
      phone: "+85512345678",
      otp: "123456",
    });

    expect(result).toEqual({ verified: true });
    expect(repo.markPhoneVerifiedByAccountId).toHaveBeenCalledWith("acc-1");
    expect(repo.createAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acc-1",
        eventKey: "AUTH_OTP_VERIFY",
        outcome: "SUCCESS",
        metadata: { verificationMode: "FIXED_FALLBACK" },
      })
    );
  });

  it("rejects fixed OTP fallback in APP_ENV=production", () => {
    process.env.V0_AUTH_PROVIDER = "supabase";
    process.env.APP_ENV = "production";
    process.env.V0_AUTH_FIXED_OTP_ENABLED = "true";

    expect(() => new V0AuthAccountService({} as any)).toThrow(
      "V0_AUTH_FIXED_OTP_ENABLED must be false in APP_ENV=production."
    );
  });

  it("rejects local auth provider in APP_ENV=staging", () => {
    process.env.V0_AUTH_PROVIDER = "local";
    process.env.APP_ENV = "staging";

    expect(() => new V0AuthAccountService({} as any)).toThrow(
      "V0_AUTH_PROVIDER must be supabase unless APP_ENV is local or test."
    );
  });
});
