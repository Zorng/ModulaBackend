import crypto from "crypto";
import jwt, { SignOptions } from "jsonwebtoken";
import { PasswordService } from "../../../auth/app/password.service.js";
import { V0AuthRepository, type V0AccountRow } from "../infra/repository.js";

type V0TokenClaims = {
  sub: string;
  accountId: string;
  tenantId: string | null;
  branchId: string | null;
  scope: "v0";
};

export class V0AuthError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "V0AuthError";
  }
}

export class V0AuthService {
  private readonly otpPurpose = "V0_REGISTER";
  private readonly otpExpiryMinutes = Number(process.env.V0_AUTH_OTP_EXPIRY_MINUTES ?? 10);
  private readonly otpMaxAttempts = Number(process.env.V0_AUTH_OTP_MAX_ATTEMPTS ?? 5);
  private readonly accessTokenExpiry = process.env.V0_AUTH_ACCESS_TOKEN_TTL ?? "12h";
  private readonly refreshTokenExpiry = process.env.V0_AUTH_REFRESH_TOKEN_TTL ?? "7d";
  private readonly jwtSecret = process.env.JWT_SECRET ?? "dev-v0-jwt-secret";

  constructor(private readonly repo: V0AuthRepository) {}

  async register(input: {
    phone: string;
    password: string;
    firstName: string;
    lastName: string;
    gender?: string;
    dateOfBirth?: string;
  }): Promise<{ accountId: string; phone: string; phoneVerified: boolean }> {
    const phone = normalizePhone(input.phone);
    if (!phone) {
      throw new V0AuthError(422, "phone is required");
    }

    if (!PasswordService.validatePasswordStrength(input.password)) {
      throw new V0AuthError(422, "password must be at least 8 characters");
    }

    const firstName = String(input.firstName ?? "").trim();
    const lastName = String(input.lastName ?? "").trim();
    if (!firstName || !lastName) {
      throw new V0AuthError(422, "firstName and lastName are required");
    }

    const existing = await this.repo.findAccountByPhone(phone);
    if (existing) {
      throw new V0AuthError(409, "account already exists");
    }

    const passwordHash = await PasswordService.hashPassword(input.password);
    const account = await this.repo.createAccount({
      phone,
      passwordHash,
      firstName,
      lastName,
      gender: normalizeOptionalText(input.gender),
      dateOfBirth: normalizeOptionalText(input.dateOfBirth),
    });

    return {
      accountId: account.id,
      phone: account.phone,
      phoneVerified: account.phone_verified_at !== null,
    };
  }

  async sendRegistrationOtp(input: {
    phone: string;
  }): Promise<{ expiresInMinutes: number; debugOtp?: string }> {
    const phone = normalizePhone(input.phone);
    if (!phone) {
      throw new V0AuthError(422, "phone is required");
    }

    const account = await this.repo.findAccountByPhone(phone);
    if (!account) {
      throw new V0AuthError(404, "account not found");
    }

    const otpCode = this.generateOtpCode();
    const codeHash = sha256(otpCode);
    const expiresAt = new Date(Date.now() + this.otpExpiryMinutes * 60 * 1000);

    await this.repo.createPhoneOtp({
      phone,
      purpose: this.otpPurpose,
      codeHash,
      expiresAt,
      maxAttempts: this.otpMaxAttempts,
    });

    return {
      expiresInMinutes: this.otpExpiryMinutes,
      ...(this.isOtpDebugMode() ? { debugOtp: otpCode } : {}),
    };
  }

  async verifyRegistrationOtp(input: {
    phone: string;
    otp: string;
  }): Promise<{ verified: true }> {
    const phone = normalizePhone(input.phone);
    const otp = String(input.otp ?? "").trim();
    if (!phone || !otp) {
      throw new V0AuthError(422, "phone and otp are required");
    }

    const latestOtp = await this.repo.findLatestActivePhoneOtp(phone, this.otpPurpose);
    if (!latestOtp) {
      throw new V0AuthError(400, "otp not found");
    }

    if (latestOtp.expires_at.getTime() <= Date.now()) {
      throw new V0AuthError(400, "otp expired");
    }

    if (latestOtp.attempts >= latestOtp.max_attempts) {
      throw new V0AuthError(400, "otp attempts exceeded");
    }

    if (sha256(otp) !== latestOtp.code_hash) {
      await this.repo.incrementPhoneOtpAttempts(latestOtp.id);
      throw new V0AuthError(400, "invalid otp");
    }

    await this.repo.consumePhoneOtp(latestOtp.id);
    await this.repo.markPhoneVerified(phone);
    return { verified: true };
  }

  async login(input: { phone: string; password: string }): Promise<{
    accessToken: string;
    refreshToken: string;
    account: {
      id: string;
      phone: string;
      firstName: string | null;
      lastName: string | null;
      phoneVerifiedAt: string | null;
    };
    context: { tenantId: string | null; branchId: string | null };
    activeMembershipsCount: number;
  }> {
    const phone = normalizePhone(input.phone);
    const password = String(input.password ?? "");
    if (!phone || !password) {
      throw new V0AuthError(422, "phone and password are required");
    }

    const account = await this.repo.findAccountByPhone(phone);
    if (!account || account.status !== "ACTIVE") {
      throw new V0AuthError(401, "invalid credentials");
    }

    const isValidPassword = await PasswordService.verifyPassword(
      password,
      account.password_hash
    );
    if (!isValidPassword) {
      throw new V0AuthError(401, "invalid credentials");
    }

    if (!account.phone_verified_at) {
      throw new V0AuthError(403, "phone is not verified");
    }

    // Phase 1 starts from a clean auth-only baseline.
    // Membership model is introduced in later phases.
    const activeMembershipsCount = 0;

    const context = { tenantId: null, branchId: null };
    return this.issueSessionResponse(account, context, activeMembershipsCount);
  }

  async refresh(input: { refreshToken: string }): Promise<{
    accessToken: string;
    refreshToken: string;
    context: { tenantId: string | null; branchId: string | null };
  }> {
    const refreshToken = String(input.refreshToken ?? "").trim();
    if (!refreshToken) {
      throw new V0AuthError(422, "refreshToken is required");
    }

    const refreshTokenHash = sha256(refreshToken);
    const session = await this.repo.findActiveSessionByRefreshTokenHash(refreshTokenHash);
    if (!session) {
      throw new V0AuthError(401, "invalid refresh token");
    }

    if (session.expires_at.getTime() <= Date.now()) {
      await this.repo.revokeSessionById(session.id);
      throw new V0AuthError(401, "refresh token expired");
    }

    const account = await this.repo.findAccountById(session.account_id);
    if (!account || account.status !== "ACTIVE") {
      await this.repo.revokeSessionById(session.id);
      throw new V0AuthError(401, "account is not active");
    }

    await this.repo.revokeSessionById(session.id);

    const context = {
      tenantId: session.context_tenant_id,
      branchId: session.context_branch_id,
    };
    const issued = await this.issueSessionTokens(account.id, context);

    return {
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      context,
    };
  }

  async logout(input: { refreshToken: string }): Promise<void> {
    const refreshToken = String(input.refreshToken ?? "").trim();
    if (!refreshToken) {
      throw new V0AuthError(422, "refreshToken is required");
    }
    await this.repo.revokeSessionByRefreshTokenHash(sha256(refreshToken));
  }

  private async issueSessionResponse(
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

  private async issueSessionTokens(
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

  private generateAccessToken(claims: V0TokenClaims): string {
    return jwt.sign(claims, this.jwtSecret, {
      expiresIn: this.accessTokenExpiry,
      issuer: "modula-v0-auth",
    } as SignOptions);
  }

  private isOtpDebugMode(): boolean {
    return process.env.NODE_ENV !== "production";
  }

  private generateOtpCode(): string {
    const fixed = this.isOtpDebugMode()
      ? process.env.AUTH_FIXED_OTP ?? "123456"
      : null;
    if (fixed) {
      return fixed;
    }

    const raw = crypto.randomInt(0, 1_000_000);
    return String(raw).padStart(6, "0");
  }

}

function normalizePhone(phone: string): string {
  return String(phone ?? "").trim();
}

function normalizeOptionalText(input: string | undefined): string | null {
  const value = String(input ?? "").trim();
  return value.length > 0 ? value : null;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function parseExpiryToMs(time: string): number {
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
