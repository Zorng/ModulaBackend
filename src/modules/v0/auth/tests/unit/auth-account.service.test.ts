import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { V0AuthAccountService } from "../../app/auth-account.service.js";

describe("v0 auth account service fixed OTP policy", () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
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

  it("sends supabase otp even if account lookup times out", async () => {
    process.env.V0_AUTH_PROVIDER = "supabase";
    process.env.APP_ENV = "staging";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => "",
    } as Response);

    const repo = {
      findAccountByPhone: jest
        .fn()
        .mockRejectedValue(new Error("Connection terminated due to connection timeout")),
      createAuditEvent: jest.fn().mockResolvedValue(undefined),
    } as any;

    const service = new V0AuthAccountService(repo);
    const result = await service.sendRegistrationOtp({
      phone: "+85512345678",
    });

    expect(result).toEqual({ expiresInMinutes: 10 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(repo.createAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: null,
        phone: "+85512345678",
        eventKey: "AUTH_OTP_SEND",
        outcome: "SUCCESS",
      })
    );
  });

  it("resets password with fixed OTP fallback in staging", async () => {
    process.env.V0_AUTH_PROVIDER = "supabase";
    process.env.APP_ENV = "staging";
    process.env.V0_AUTH_FIXED_OTP_ENABLED = "true";
    process.env.AUTH_FIXED_OTP = "123456";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          user: {
            id: "supabase-user-reset",
            phone: "+85512345678",
            phone_confirmed_at: "2026-03-22T07:00:00.000Z",
            user_metadata: {
              firstName: "Reset",
              lastName: "User",
            },
          },
        }),
    } as Response);

    const repo = {
      findAccountByPhone: jest.fn().mockResolvedValue({
        id: "acc-reset",
        supabase_user_id: "supabase-user-reset",
        phone: "+85512345678",
        password_hash: null,
        status: "ACTIVE",
        phone_verified_at: null,
        first_name: "Reset",
        last_name: "User",
        gender: null,
        date_of_birth: null,
      }),
      markPhoneVerifiedByAccountId: jest.fn().mockResolvedValue(undefined),
      revokeSessionsByAccountId: jest.fn().mockResolvedValue(undefined),
      createAuditEvent: jest.fn().mockResolvedValue(undefined),
    } as any;

    const service = new V0AuthAccountService(repo);
    const result = await service.confirmPasswordReset({
      phone: "+85512345678",
      otp: "123456",
      newPassword: "NewStrong123!",
    });

    expect(result).toEqual({ reset: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(repo.markPhoneVerifiedByAccountId).toHaveBeenCalledWith("acc-reset");
    expect(repo.revokeSessionsByAccountId).toHaveBeenCalledWith("acc-reset");
    expect(repo.createAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acc-reset",
        eventKey: "AUTH_PASSWORD_RESET_CONFIRM",
        outcome: "SUCCESS",
        metadata: { verificationMode: "FIXED_FALLBACK" },
      })
    );
  });

  it("changes password for an authenticated supabase account", async () => {
    process.env.V0_AUTH_PROVIDER = "supabase";
    process.env.APP_ENV = "staging";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            user: {
              id: "supabase-user-change",
              phone: "+85512345678",
              phone_confirmed_at: "2026-03-22T07:00:00.000Z",
            },
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            user: {
              id: "supabase-user-change",
              phone: "+85512345678",
              phone_confirmed_at: "2026-03-22T07:00:00.000Z",
            },
          }),
      } as Response);

    const repo = {
      findAccountById: jest.fn().mockResolvedValue({
        id: "acc-change",
        supabase_user_id: "supabase-user-change",
        phone: "+85512345678",
        password_hash: null,
        status: "ACTIVE",
        phone_verified_at: new Date("2026-03-22T07:00:00.000Z"),
        first_name: "Change",
        last_name: "User",
        gender: null,
        date_of_birth: null,
      }),
      revokeSessionsByAccountId: jest.fn().mockResolvedValue(undefined),
      createAuditEvent: jest.fn().mockResolvedValue(undefined),
    } as any;

    const service = new V0AuthAccountService(repo);
    const result = await service.changePassword({
      accountId: "acc-change",
      currentPassword: "Current123!",
      newPassword: "NewStrong123!",
    });

    expect(result).toEqual({ changed: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(repo.revokeSessionsByAccountId).toHaveBeenCalledWith("acc-change");
    expect(repo.createAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acc-change",
        eventKey: "AUTH_PASSWORD_CHANGE",
        outcome: "SUCCESS",
      })
    );
  });

  it("rebuilds missing local account projection after supabase otp verify", async () => {
    process.env.V0_AUTH_PROVIDER = "supabase";
    process.env.APP_ENV = "staging";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          user: {
            id: "supabase-user-2",
            phone: "+85598765432",
            phone_confirmed_at: "2026-03-22T07:00:00.000Z",
            user_metadata: {
              firstName: "Recovered",
              lastName: "User",
              gender: "MALE",
            },
          },
        }),
    } as Response);

    const createdAccount = {
      id: "acc-recovered",
      supabase_user_id: null,
      phone: "+85598765432",
      password_hash: null,
      status: "ACTIVE",
      phone_verified_at: null,
      first_name: null,
      last_name: null,
      gender: null,
      date_of_birth: null,
    };

    const hydratedAccount = {
      ...createdAccount,
      supabase_user_id: "supabase-user-2",
      first_name: "Recovered",
      last_name: "User",
      gender: "MALE",
      date_of_birth: null,
    };

    const repo = {
      findAccountBySupabaseUserId: jest.fn().mockResolvedValue(null),
      findAccountByPhone: jest.fn().mockResolvedValue(null),
      createInvitedAccount: jest.fn().mockResolvedValue(createdAccount),
      attachSupabaseUserId: jest.fn().mockResolvedValue(undefined),
      updateAccountProjectionFromSupabase: jest.fn().mockResolvedValue(hydratedAccount),
      markPhoneVerifiedByAccountId: jest.fn().mockResolvedValue(undefined),
      createAuditEvent: jest.fn().mockResolvedValue(undefined),
    } as any;

    const service = new V0AuthAccountService(repo);
    const result = await service.verifyRegistrationOtp({
      phone: "+85598765432",
      otp: "654321",
    });

    expect(result).toEqual({ verified: true });
    expect(repo.createInvitedAccount).toHaveBeenCalledWith({
      phone: "+85598765432",
    });
    expect(repo.attachSupabaseUserId).toHaveBeenCalledWith({
      accountId: "acc-recovered",
      supabaseUserId: "supabase-user-2",
    });
    expect(repo.updateAccountProjectionFromSupabase).toHaveBeenCalledWith({
      accountId: "acc-recovered",
      supabaseUserId: null,
      phone: null,
      firstName: "Recovered",
      lastName: "User",
      gender: "MALE",
      dateOfBirth: null,
    });
    expect(repo.markPhoneVerifiedByAccountId).toHaveBeenCalledWith("acc-recovered");
    expect(repo.createAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acc-recovered",
        eventKey: "AUTH_OTP_VERIFY",
        outcome: "SUCCESS",
      })
    );
  });

  it("hydrates missing first and last name from supabase login session", async () => {
    process.env.V0_AUTH_PROVIDER = "supabase";
    process.env.APP_ENV = "staging";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          user: {
            id: "supabase-user-3",
            phone: "+85511112222",
            phone_confirmed_at: "2026-03-22T07:00:00.000Z",
            user_metadata: {
              firstName: "Sok",
              lastName: "Dara",
            },
          },
        }),
    } as Response);

    const existingAccount = {
      id: "acc-login",
      supabase_user_id: "supabase-user-3",
      phone: "+85511112222",
      password_hash: null,
      status: "ACTIVE",
      phone_verified_at: new Date("2026-03-22T07:00:00.000Z"),
      first_name: null,
      last_name: null,
      gender: null,
      date_of_birth: null,
    };

    const hydratedAccount = {
      ...existingAccount,
      first_name: "Sok",
      last_name: "Dara",
    };

    const repo = {
      findAccountBySupabaseUserId: jest.fn().mockResolvedValue(existingAccount),
      findAccountByPhone: jest.fn().mockResolvedValue(existingAccount),
      updateAccountProjectionFromSupabase: jest.fn().mockResolvedValue(hydratedAccount),
      countActiveMemberships: jest.fn().mockResolvedValue(1),
      createSession: jest.fn().mockResolvedValue({ id: "session-1" }),
      createAuditEvent: jest.fn().mockResolvedValue(undefined),
    } as any;

    const service = new V0AuthAccountService(repo);
    const result = await service.login({
      phone: "+85511112222",
      password: "StrongPass123!",
    });

    expect(result.account.firstName).toBe("Sok");
    expect(result.account.lastName).toBe("Dara");
    expect(repo.updateAccountProjectionFromSupabase).toHaveBeenCalledWith({
      accountId: "acc-login",
      supabaseUserId: null,
      phone: null,
      firstName: "Sok",
      lastName: "Dara",
      gender: null,
      dateOfBirth: null,
    });
  });
});
