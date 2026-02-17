import crypto from "crypto";
import jwt, { SignOptions } from "jsonwebtoken";
import type { V0AccountRow, V0AuthRepository } from "../infra/repository.js";
import { parseExpiryToMs, sha256, type V0TokenClaims } from "./common.js";

export abstract class V0AuthBaseService {
  protected readonly otpPurpose = "V0_REGISTER";
  protected readonly otpExpiryMinutes = Number(
    process.env.V0_AUTH_OTP_EXPIRY_MINUTES ?? 10
  );
  protected readonly otpMaxAttempts = Number(process.env.V0_AUTH_OTP_MAX_ATTEMPTS ?? 5);
  protected readonly otpResendCooldownSeconds = Number(
    process.env.V0_AUTH_OTP_RESEND_COOLDOWN_SECONDS ?? 60
  );
  protected readonly otpMaxPerHour = Number(process.env.V0_AUTH_OTP_MAX_PER_HOUR ?? 6);
  protected readonly accessTokenExpiry = process.env.V0_AUTH_ACCESS_TOKEN_TTL ?? "12h";
  protected readonly refreshTokenExpiry = process.env.V0_AUTH_REFRESH_TOKEN_TTL ?? "7d";
  protected readonly jwtSecret = process.env.JWT_SECRET ?? "dev-v0-jwt-secret";
  protected readonly privilegedRoles = new Set(["OWNER", "ADMIN"]);
  protected readonly assignableRoles = new Set(["ADMIN", "MANAGER", "CASHIER", "CLERK"]);
  protected readonly tenantCountPerAccountHard = this.readPositiveInt(
    process.env.V0_FAIRUSE_TENANT_COUNT_PER_ACCOUNT_HARD,
    20
  );
  protected readonly tenantProvisionRateLimit = this.readPositiveInt(
    process.env.V0_FAIRUSE_TENANT_PROVISION_RATE_LIMIT,
    10
  );
  protected readonly tenantProvisionRateWindowSeconds = this.readPositiveInt(
    process.env.V0_FAIRUSE_TENANT_PROVISION_WINDOW_SECONDS,
    3600
  );

  constructor(protected readonly repo: V0AuthRepository) {}

  protected async issueSessionResponse(
    account: V0AccountRow,
    context: { tenantId: string | null; branchId: string | null },
    activeMembershipsCount: number
  ) {
    const issued = await this.issueSessionTokens(account.id, context);
    return {
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      account: {
        id: account.id,
        phone: account.phone,
        firstName: account.first_name,
        lastName: account.last_name,
        phoneVerifiedAt: account.phone_verified_at
          ? account.phone_verified_at.toISOString()
          : null,
      },
      context,
      activeMembershipsCount,
    };
  }

  protected async issueSessionTokens(
    accountId: string,
    context: { tenantId: string | null; branchId: string | null }
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.generateAccessToken({
      sub: accountId,
      accountId,
      tenantId: context.tenantId,
      branchId: context.branchId,
      scope: "v0",
    });

    const refreshToken = crypto.randomBytes(64).toString("hex");
    const refreshTokenHash = sha256(refreshToken);
    const refreshExpiry = new Date(Date.now() + parseExpiryToMs(this.refreshTokenExpiry));

    await this.repo.createSession({
      accountId,
      refreshTokenHash,
      contextTenantId: context.tenantId,
      contextBranchId: context.branchId,
      expiresAt: refreshExpiry,
    });

    return { accessToken, refreshToken };
  }

  protected generateAccessToken(claims: V0TokenClaims): string {
    return jwt.sign(claims, this.jwtSecret, {
      expiresIn: this.accessTokenExpiry,
      issuer: "modula-v0-auth",
    } as SignOptions);
  }

  protected isOtpDebugMode(): boolean {
    return process.env.NODE_ENV !== "production";
  }

  protected generateOtpCode(): string {
    const fixed = this.isOtpDebugMode()
      ? process.env.AUTH_FIXED_OTP ?? "123456"
      : null;
    if (fixed) {
      return fixed;
    }

    const raw = crypto.randomInt(0, 1_000_000);
    return String(raw).padStart(6, "0");
  }

  protected async writeAuditEventBestEffort(input: {
    accountId?: string | null;
    phone?: string | null;
    eventKey: string;
    outcome: "SUCCESS" | "FAILED";
    reasonCode?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    try {
      await this.repo.createAuditEvent(input);
    } catch {
      // audit is best-effort, should never block auth flow.
    }
  }

  private readPositiveInt(input: string | undefined, fallback: number): number {
    const parsed = Number(input);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }
}
