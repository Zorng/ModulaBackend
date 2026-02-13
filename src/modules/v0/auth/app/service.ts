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
  private readonly otpResendCooldownSeconds = Number(
    process.env.V0_AUTH_OTP_RESEND_COOLDOWN_SECONDS ?? 60
  );
  private readonly otpMaxPerHour = Number(process.env.V0_AUTH_OTP_MAX_PER_HOUR ?? 6);
  private readonly accessTokenExpiry = process.env.V0_AUTH_ACCESS_TOKEN_TTL ?? "12h";
  private readonly refreshTokenExpiry = process.env.V0_AUTH_REFRESH_TOKEN_TTL ?? "7d";
  private readonly jwtSecret = process.env.JWT_SECRET ?? "dev-v0-jwt-secret";
  private readonly privilegedRoles = new Set(["OWNER", "ADMIN"]);
  private readonly assignableRoles = new Set([
    "ADMIN",
    "MANAGER",
    "CASHIER",
    "CLERK",
  ]);

  constructor(private readonly repo: V0AuthRepository) {}

  async register(input: {
    phone: string;
    password: string;
    firstName: string;
    lastName: string;
    gender?: string;
    dateOfBirth?: string;
  }): Promise<{
    accountId: string;
    phone: string;
    phoneVerified: boolean;
    completedExistingInviteAccount?: boolean;
  }> {
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
      if (existing.phone_verified_at) {
        await this.writeAuditEventBestEffort({
          accountId: existing.id,
          phone,
          eventKey: "AUTH_REGISTER",
          outcome: "FAILED",
          reasonCode: "ACCOUNT_EXISTS",
        });
        throw new V0AuthError(409, "account already exists");
      }

      const passwordHash = await PasswordService.hashPassword(input.password);
      const account = await this.repo.updateAccountRegistration({
        accountId: existing.id,
        passwordHash,
        firstName,
        lastName,
        gender: normalizeOptionalText(input.gender),
        dateOfBirth: normalizeOptionalText(input.dateOfBirth),
      });
      await this.writeAuditEventBestEffort({
        accountId: account.id,
        phone,
        eventKey: "AUTH_REGISTER_COMPLETE_EXISTING",
        outcome: "SUCCESS",
      });
      return {
        accountId: account.id,
        phone: account.phone,
        phoneVerified: account.phone_verified_at !== null,
        completedExistingInviteAccount: true,
      };
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
    await this.writeAuditEventBestEffort({
      accountId: account.id,
      phone,
      eventKey: "AUTH_REGISTER",
      outcome: "SUCCESS",
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
      await this.writeAuditEventBestEffort({
        phone,
        eventKey: "AUTH_OTP_SEND",
        outcome: "FAILED",
        reasonCode: "ACCOUNT_NOT_FOUND",
      });
      throw new V0AuthError(404, "account not found");
    }

    const latestOtp = await this.repo.findLatestPhoneOtpByPurpose(
      phone,
      this.otpPurpose
    );
    if (latestOtp) {
      const cooldownMs = this.otpResendCooldownSeconds * 1000;
      const remainingMs = latestOtp.created_at.getTime() + cooldownMs - Date.now();
      if (remainingMs > 0) {
        const retryAfterSeconds = Math.ceil(remainingMs / 1000);
        await this.writeAuditEventBestEffort({
          accountId: account.id,
          phone,
          eventKey: "AUTH_OTP_SEND",
          outcome: "FAILED",
          reasonCode: "OTP_COOLDOWN",
          metadata: { retryAfterSeconds },
        });
        throw new V0AuthError(
          429,
          `otp recently sent; retry in ${retryAfterSeconds} seconds`
        );
      }
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const sentInLastHour = await this.repo.countPhoneOtpsSince({
      phone,
      purpose: this.otpPurpose,
      since: oneHourAgo,
    });
    if (sentInLastHour >= this.otpMaxPerHour) {
      await this.writeAuditEventBestEffort({
        accountId: account.id,
        phone,
        eventKey: "AUTH_OTP_SEND",
        outcome: "FAILED",
        reasonCode: "OTP_RATE_LIMIT",
        metadata: { maxPerHour: this.otpMaxPerHour },
      });
      throw new V0AuthError(429, "otp rate limit exceeded; try again later");
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

    await this.writeAuditEventBestEffort({
      accountId: account.id,
      phone,
      eventKey: "AUTH_OTP_SEND",
      outcome: "SUCCESS",
      metadata: { expiresInMinutes: this.otpExpiryMinutes },
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

    const account = await this.repo.findAccountByPhone(phone);
    const latestOtp = await this.repo.findLatestActivePhoneOtp(phone, this.otpPurpose);
    if (!latestOtp) {
      await this.writeAuditEventBestEffort({
        accountId: account?.id ?? null,
        phone,
        eventKey: "AUTH_OTP_VERIFY",
        outcome: "FAILED",
        reasonCode: "OTP_NOT_FOUND",
      });
      throw new V0AuthError(400, "otp not found");
    }

    if (latestOtp.expires_at.getTime() <= Date.now()) {
      await this.writeAuditEventBestEffort({
        accountId: account?.id ?? null,
        phone,
        eventKey: "AUTH_OTP_VERIFY",
        outcome: "FAILED",
        reasonCode: "OTP_EXPIRED",
      });
      throw new V0AuthError(400, "otp expired");
    }

    if (latestOtp.attempts >= latestOtp.max_attempts) {
      await this.writeAuditEventBestEffort({
        accountId: account?.id ?? null,
        phone,
        eventKey: "AUTH_OTP_VERIFY",
        outcome: "FAILED",
        reasonCode: "OTP_ATTEMPTS_EXCEEDED",
      });
      throw new V0AuthError(400, "otp attempts exceeded");
    }

    if (sha256(otp) !== latestOtp.code_hash) {
      await this.repo.incrementPhoneOtpAttempts(latestOtp.id);
      await this.writeAuditEventBestEffort({
        accountId: account?.id ?? null,
        phone,
        eventKey: "AUTH_OTP_VERIFY",
        outcome: "FAILED",
        reasonCode: "OTP_INVALID",
      });
      throw new V0AuthError(400, "invalid otp");
    }

    await this.repo.consumePhoneOtp(latestOtp.id);
    await this.repo.markPhoneVerified(phone);
    await this.writeAuditEventBestEffort({
      accountId: account?.id ?? null,
      phone,
      eventKey: "AUTH_OTP_VERIFY",
      outcome: "SUCCESS",
    });
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
      await this.writeAuditEventBestEffort({
        phone,
        eventKey: "AUTH_LOGIN",
        outcome: "FAILED",
        reasonCode: "INVALID_CREDENTIALS",
      });
      throw new V0AuthError(401, "invalid credentials");
    }

    const isValidPassword = await PasswordService.verifyPassword(
      password,
      account.password_hash
    );
    if (!isValidPassword) {
      await this.writeAuditEventBestEffort({
        accountId: account.id,
        phone,
        eventKey: "AUTH_LOGIN",
        outcome: "FAILED",
        reasonCode: "INVALID_CREDENTIALS",
      });
      throw new V0AuthError(401, "invalid credentials");
    }

    if (!account.phone_verified_at) {
      await this.writeAuditEventBestEffort({
        accountId: account.id,
        phone,
        eventKey: "AUTH_LOGIN",
        outcome: "FAILED",
        reasonCode: "PHONE_NOT_VERIFIED",
      });
      throw new V0AuthError(403, "phone is not verified");
    }

    const activeMembershipsCount = await this.repo.countActiveMemberships(
      account.id
    );

    const context = { tenantId: null, branchId: null };
    await this.writeAuditEventBestEffort({
      accountId: account.id,
      phone,
      eventKey: "AUTH_LOGIN",
      outcome: "SUCCESS",
    });
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
      await this.writeAuditEventBestEffort({
        eventKey: "AUTH_REFRESH",
        outcome: "FAILED",
        reasonCode: "INVALID_REFRESH_TOKEN",
      });
      throw new V0AuthError(401, "invalid refresh token");
    }

    if (session.expires_at.getTime() <= Date.now()) {
      await this.repo.revokeSessionById(session.id);
      await this.writeAuditEventBestEffort({
        accountId: session.account_id,
        eventKey: "AUTH_REFRESH",
        outcome: "FAILED",
        reasonCode: "REFRESH_TOKEN_EXPIRED",
      });
      throw new V0AuthError(401, "refresh token expired");
    }

    const account = await this.repo.findAccountById(session.account_id);
    if (!account || account.status !== "ACTIVE") {
      await this.repo.revokeSessionById(session.id);
      await this.writeAuditEventBestEffort({
        accountId: session.account_id,
        eventKey: "AUTH_REFRESH",
        outcome: "FAILED",
        reasonCode: "ACCOUNT_INACTIVE",
      });
      throw new V0AuthError(401, "account is not active");
    }

    await this.repo.revokeSessionById(session.id);

    const context = {
      tenantId: session.context_tenant_id,
      branchId: session.context_branch_id,
    };
    const issued = await this.issueSessionTokens(account.id, context);
    await this.writeAuditEventBestEffort({
      accountId: account.id,
      phone: account.phone,
      eventKey: "AUTH_REFRESH",
      outcome: "SUCCESS",
    });

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
    const refreshTokenHash = sha256(refreshToken);
    const session = await this.repo.findActiveSessionByRefreshTokenHash(refreshTokenHash);
    await this.repo.revokeSessionByRefreshTokenHash(refreshTokenHash);
    const account =
      session?.account_id != null
        ? await this.repo.findAccountById(session.account_id)
        : null;
    await this.writeAuditEventBestEffort({
      accountId: session?.account_id ?? null,
      phone: account?.phone ?? null,
      eventKey: "AUTH_LOGOUT",
      outcome: "SUCCESS",
    });
  }

  async inviteMembership(input: {
    requesterAccountId: string;
    tenantId: string;
    phone: string;
    roleKey: string;
  }): Promise<{
    membershipId: string;
    tenantId: string;
    accountId: string;
    phone: string;
    roleKey: string;
    status: string;
  }> {
    const tenantId = String(input.tenantId ?? "").trim();
    const phone = normalizePhone(input.phone);
    const roleKey = normalizeRoleKey(input.roleKey);

    if (!tenantId || !phone || !roleKey) {
      throw new V0AuthError(422, "tenantId, phone, and roleKey are required");
    }
    if (!this.assignableRoles.has(roleKey)) {
      throw new V0AuthError(422, "invalid roleKey");
    }

    const requesterMembership = await this.repo.findActiveMembership(
      input.requesterAccountId,
      tenantId
    );
    if (!requesterMembership) {
      throw new V0AuthError(403, "requester has no active membership for tenant");
    }
    if (!this.privilegedRoles.has(requesterMembership.role_key)) {
      throw new V0AuthError(403, "requester role cannot invite members");
    }

    let account = await this.repo.findAccountByPhone(phone);
    if (!account) {
      const randomPassword = crypto.randomBytes(32).toString("hex");
      const passwordHash = await PasswordService.hashPassword(randomPassword);
      account = await this.repo.createInvitedAccount({
        phone,
        passwordHash,
      });
    }

    const existingMembership = await this.repo.findMembershipByTenantAndAccount(
      tenantId,
      account.id
    );
    if (existingMembership?.status === "ACTIVE") {
      throw new V0AuthError(409, "membership already active");
    }

    const membership = await this.repo.upsertInvitedMembership({
      tenantId,
      accountId: account.id,
      roleKey,
      invitedByMembershipId: requesterMembership.id,
    });

    await this.writeAuditEventBestEffort({
      accountId: input.requesterAccountId,
      phone,
      eventKey: "AUTH_MEMBERSHIP_INVITE",
      outcome: "SUCCESS",
      metadata: {
        tenantId,
        targetAccountId: account.id,
        roleKey,
        membershipId: membership.id,
      },
    });

    return {
      membershipId: membership.id,
      tenantId: membership.tenant_id,
      accountId: membership.account_id,
      phone: account.phone,
      roleKey: membership.role_key,
      status: membership.status,
    };
  }

  async listInvitationInbox(input: { requesterAccountId: string }): Promise<{
    invitations: Array<{
      membershipId: string;
      tenantId: string;
      tenantName: string;
      roleKey: string;
      invitedAt: string;
      invitedByMembershipId: string | null;
    }>;
  }> {
    const rows = await this.repo.listInvitationInbox(input.requesterAccountId);
    return {
      invitations: rows.map((row) => ({
        membershipId: row.membership_id,
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
        roleKey: row.role_key,
        invitedAt: row.invited_at.toISOString(),
        invitedByMembershipId: row.invited_by_membership_id,
      })),
    };
  }

  async acceptInvitation(input: {
    requesterAccountId: string;
    membershipId: string;
  }): Promise<{ membershipId: string; tenantId: string; status: string }> {
    const membershipId = String(input.membershipId ?? "").trim();
    if (!membershipId) {
      throw new V0AuthError(422, "membershipId is required");
    }

    const existing = await this.repo.findMembershipById(membershipId);
    if (!existing) {
      throw new V0AuthError(404, "invitation not found");
    }
    if (existing.account_id !== input.requesterAccountId) {
      throw new V0AuthError(403, "cannot accept invitation for another account");
    }
    if (existing.status !== "INVITED") {
      throw new V0AuthError(409, "invitation is not pending");
    }

    const updated = await this.repo.acceptInvitation({
      membershipId,
      accountId: input.requesterAccountId,
    });
    if (!updated) {
      throw new V0AuthError(409, "invitation is not pending");
    }

    await this.writeAuditEventBestEffort({
      accountId: input.requesterAccountId,
      eventKey: "AUTH_MEMBERSHIP_ACCEPT",
      outcome: "SUCCESS",
      metadata: {
        membershipId: updated.id,
        tenantId: updated.tenant_id,
      },
    });

    return {
      membershipId: updated.id,
      tenantId: updated.tenant_id,
      status: updated.status,
    };
  }

  async rejectInvitation(input: {
    requesterAccountId: string;
    membershipId: string;
  }): Promise<{ membershipId: string; tenantId: string; status: string }> {
    const membershipId = String(input.membershipId ?? "").trim();
    if (!membershipId) {
      throw new V0AuthError(422, "membershipId is required");
    }

    const existing = await this.repo.findMembershipById(membershipId);
    if (!existing) {
      throw new V0AuthError(404, "invitation not found");
    }
    if (existing.account_id !== input.requesterAccountId) {
      throw new V0AuthError(403, "cannot reject invitation for another account");
    }
    if (existing.status !== "INVITED") {
      throw new V0AuthError(409, "invitation is not pending");
    }

    const updated = await this.repo.rejectInvitation({
      membershipId,
      accountId: input.requesterAccountId,
    });
    if (!updated) {
      throw new V0AuthError(409, "invitation is not pending");
    }

    await this.writeAuditEventBestEffort({
      accountId: input.requesterAccountId,
      eventKey: "AUTH_MEMBERSHIP_REJECT",
      outcome: "SUCCESS",
      metadata: {
        membershipId: updated.id,
        tenantId: updated.tenant_id,
      },
    });

    return {
      membershipId: updated.id,
      tenantId: updated.tenant_id,
      status: updated.status,
    };
  }

  async changeMembershipRole(input: {
    requesterAccountId: string;
    membershipId: string;
    roleKey: string;
  }): Promise<{ membershipId: string; tenantId: string; roleKey: string }> {
    const membershipId = String(input.membershipId ?? "").trim();
    const roleKey = normalizeRoleKey(input.roleKey);
    if (!membershipId || !roleKey) {
      throw new V0AuthError(422, "membershipId and roleKey are required");
    }
    if (!this.assignableRoles.has(roleKey)) {
      throw new V0AuthError(422, "invalid roleKey");
    }

    const target = await this.repo.findMembershipById(membershipId);
    if (!target) {
      throw new V0AuthError(404, "membership not found");
    }
    if (target.role_key === "OWNER") {
      throw new V0AuthError(409, "owner role cannot be changed");
    }

    const requesterMembership = await this.repo.findActiveMembership(
      input.requesterAccountId,
      target.tenant_id
    );
    if (!requesterMembership || !this.privilegedRoles.has(requesterMembership.role_key)) {
      throw new V0AuthError(403, "requester role cannot change membership role");
    }

    const updated = await this.repo.updateMembershipRole({
      membershipId,
      roleKey,
    });
    if (!updated) {
      throw new V0AuthError(404, "membership not found");
    }

    await this.writeAuditEventBestEffort({
      accountId: input.requesterAccountId,
      eventKey: "AUTH_MEMBERSHIP_ROLE_CHANGE",
      outcome: "SUCCESS",
      metadata: {
        membershipId: updated.id,
        tenantId: updated.tenant_id,
        roleKey: updated.role_key,
      },
    });

    return {
      membershipId: updated.id,
      tenantId: updated.tenant_id,
      roleKey: updated.role_key,
    };
  }

  async revokeMembership(input: {
    requesterAccountId: string;
    membershipId: string;
  }): Promise<{ membershipId: string; tenantId: string; status: string }> {
    const membershipId = String(input.membershipId ?? "").trim();
    if (!membershipId) {
      throw new V0AuthError(422, "membershipId is required");
    }

    const target = await this.repo.findMembershipById(membershipId);
    if (!target) {
      throw new V0AuthError(404, "membership not found");
    }
    if (target.role_key === "OWNER") {
      throw new V0AuthError(409, "owner membership cannot be revoked");
    }

    const requesterMembership = await this.repo.findActiveMembership(
      input.requesterAccountId,
      target.tenant_id
    );
    if (!requesterMembership || !this.privilegedRoles.has(requesterMembership.role_key)) {
      throw new V0AuthError(403, "requester role cannot revoke membership");
    }
    if (requesterMembership.id === target.id) {
      throw new V0AuthError(409, "cannot revoke own membership");
    }

    const updated = await this.repo.revokeMembership(membershipId);
    if (!updated) {
      throw new V0AuthError(404, "membership not found");
    }

    await this.writeAuditEventBestEffort({
      accountId: input.requesterAccountId,
      eventKey: "AUTH_MEMBERSHIP_REVOKE",
      outcome: "SUCCESS",
      metadata: {
        membershipId: updated.id,
        tenantId: updated.tenant_id,
      },
    });

    return {
      membershipId: updated.id,
      tenantId: updated.tenant_id,
      status: updated.status,
    };
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

  private async writeAuditEventBestEffort(input: {
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
      // Phase 1: audit is best-effort, should never block auth flow.
    }
  }

}

function normalizePhone(phone: string): string {
  return String(phone ?? "").trim();
}

function normalizeOptionalText(input: string | undefined): string | null {
  const value = String(input ?? "").trim();
  return value.length > 0 ? value : null;
}

function normalizeRoleKey(input: string | undefined): string {
  return String(input ?? "").trim().toUpperCase();
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
