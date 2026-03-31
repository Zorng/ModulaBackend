import { V0PasswordService } from "./password.service.js";
import { V0AuthBaseService } from "./base.service.js";
import {
  V0AuthError,
  normalizeOptionalText,
  normalizePhone,
  sha256,
} from "./common.js";
import type { V0AccountRow, V0AuthRepository } from "../infra/repository.js";
import {
  SupabaseAuthClient,
  SupabaseAuthError,
} from "../infra/supabase-auth.client.js";

export class V0AuthAccountService extends V0AuthBaseService {
  private readonly authProvider = process.env.V0_AUTH_PROVIDER ?? "supabase";
  private readonly supabase = SupabaseAuthClient.fromEnv();
  private readonly passwordResetOtpPurpose = "V0_PASSWORD_RESET";

  constructor(repo: V0AuthRepository) {
    super(repo);

    if (this.requiresSupabaseProvider() && !this.isSupabaseEnabled()) {
      throw new Error("V0_AUTH_PROVIDER must be supabase unless APP_ENV is local or test.");
    }
  }

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
    return this.isSupabaseEnabled()
      ? this.registerWithSupabase(input)
      : this.registerWithLocalAuth(input);
  }

  async sendRegistrationOtp(input: {
    phone: string;
  }): Promise<{ expiresInMinutes: number; debugOtp?: string }> {
    return this.isSupabaseEnabled()
      ? this.sendRegistrationOtpWithSupabase(input)
      : this.sendRegistrationOtpWithLocalAuth(input);
  }

  async verifyRegistrationOtp(input: {
    phone: string;
    otp: string;
  }): Promise<{ verified: true }> {
    return this.isSupabaseEnabled()
      ? this.verifyRegistrationOtpWithSupabase(input)
      : this.verifyRegistrationOtpWithLocalAuth(input);
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
    return this.isSupabaseEnabled()
      ? this.loginWithSupabase(input)
      : this.loginWithLocalAuth(input);
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
      session?.account_id != null ? await this.repo.findAccountById(session.account_id) : null;
    await this.writeAuditEventBestEffort({
      accountId: session?.account_id ?? null,
      phone: account?.phone ?? null,
      eventKey: "AUTH_LOGOUT",
      outcome: "SUCCESS",
    });
  }

  async requestPasswordReset(input: {
    phone: string;
  }): Promise<{ expiresInMinutes: number; debugOtp?: string }> {
    return this.isSupabaseEnabled()
      ? this.requestPasswordResetWithSupabase(input)
      : this.requestPasswordResetWithLocalAuth(input);
  }

  async confirmPasswordReset(input: {
    phone: string;
    otp: string;
    newPassword: string;
  }): Promise<{ reset: true }> {
    return this.isSupabaseEnabled()
      ? this.confirmPasswordResetWithSupabase(input)
      : this.confirmPasswordResetWithLocalAuth(input);
  }

  async changePassword(input: {
    accountId: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<{ changed: true }> {
    return this.isSupabaseEnabled()
      ? this.changePasswordWithSupabase(input)
      : this.changePasswordWithLocalAuth(input);
  }

  private isSupabaseEnabled(): boolean {
    return this.authProvider === "supabase";
  }

  private requiresSupabaseProvider(): boolean {
    return this.appEnv !== "local" && this.appEnv !== "test";
  }

  private requireSupabase(): SupabaseAuthClient {
    if (!this.supabase) {
      throw new V0AuthError(
        500,
        "supabase auth provider is enabled but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing"
      );
    }
    return this.supabase;
  }

  private async registerWithSupabase(input: {
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
    if (!V0PasswordService.validatePasswordStrength(input.password)) {
      throw new V0AuthError(422, "password must be at least 8 characters");
    }

    const firstName = String(input.firstName ?? "").trim();
    const lastName = String(input.lastName ?? "").trim();
    if (!firstName || !lastName) {
      throw new V0AuthError(422, "firstName and lastName are required");
    }

    const supabase = this.requireSupabase();
    const existing = await this.repo.findAccountByPhone(phone);

    try {
      if (existing?.phone_verified_at) {
        await this.writeAuditEventBestEffort({
          accountId: existing.id,
          phone,
          eventKey: "AUTH_REGISTER",
          outcome: "FAILED",
          reasonCode: "ACCOUNT_EXISTS",
        });
        throw new V0AuthError(409, "account already exists");
      }

      let supabaseUserId = existing?.supabase_user_id ?? null;
      if (supabaseUserId) {
        await supabase.updateUser(supabaseUserId, {
          phone,
          password: input.password,
          firstName,
          lastName,
          gender: normalizeOptionalText(input.gender),
          dateOfBirth: normalizeOptionalText(input.dateOfBirth),
        });
      } else {
        const created = await supabase.createUser({
          phone,
          password: input.password,
          firstName,
          lastName,
          gender: normalizeOptionalText(input.gender),
          dateOfBirth: normalizeOptionalText(input.dateOfBirth),
        });
        supabaseUserId = created.userId;
      }

      let account;
      if (existing) {
        account = await this.repo.updateAccountRegistration({
          accountId: existing.id,
          supabaseUserId,
          phone,
          firstName,
          lastName,
          gender: normalizeOptionalText(input.gender),
          dateOfBirth: normalizeOptionalText(input.dateOfBirth),
        });
      } else {
        account = await this.repo.createAccount({
          supabaseUserId,
          phone,
          firstName,
          lastName,
          gender: normalizeOptionalText(input.gender),
          dateOfBirth: normalizeOptionalText(input.dateOfBirth),
        });
      }

      await this.writeAuditEventBestEffort({
        accountId: account.id,
        phone,
        eventKey: existing ? "AUTH_REGISTER_COMPLETE_EXISTING" : "AUTH_REGISTER",
        outcome: "SUCCESS",
      });
      return {
        accountId: account.id,
        phone: account.phone,
        phoneVerified: account.phone_verified_at !== null,
        ...(existing ? { completedExistingInviteAccount: true } : {}),
      };
    } catch (error) {
      throw this.translateSupabaseError(error);
    }
  }

  private async sendRegistrationOtpWithSupabase(input: {
    phone: string;
  }): Promise<{ expiresInMinutes: number }> {
    const phone = normalizePhone(input.phone);
    if (!phone) {
      throw new V0AuthError(422, "phone is required");
    }

    try {
      const supabase = this.requireSupabase();
      await supabase.sendOtp(phone);
      const account = await this.findAccountByPhoneBestEffort(phone);
      await this.writeAuditEventBestEffort({
        accountId: account?.id ?? null,
        phone,
        eventKey: "AUTH_OTP_SEND",
        outcome: "SUCCESS",
      });
      return { expiresInMinutes: this.otpExpiryMinutes };
    } catch (error) {
      const account = await this.findAccountByPhoneBestEffort(phone);
      await this.writeAuditEventBestEffort({
        accountId: account?.id ?? null,
        phone,
        eventKey: "AUTH_OTP_SEND",
        outcome: "FAILED",
        reasonCode: "SUPABASE_OTP_SEND_FAILED",
      });
      throw this.translateSupabaseError(error);
    }
  }

  private async verifyRegistrationOtpWithSupabase(input: {
    phone: string;
    otp: string;
  }): Promise<{ verified: true }> {
    const phone = normalizePhone(input.phone);
    const otp = String(input.otp ?? "").trim();
    if (!phone || !otp) {
      throw new V0AuthError(422, "phone and otp are required");
    }

    if (this.matchesFixedOtp(otp)) {
      return this.verifyRegistrationOtpWithFixedFallback(phone);
    }

    try {
      const supabase = this.requireSupabase();
      const verified = await supabase.verifyOtp({ phone, otp });

      let account = await this.resolveSupabaseProjectedAccount({
        verifiedUserId: verified.userId,
        phone,
      });
      if (!account) {
        throw new V0AuthError(404, "account not found");
      }

      account = await this.hydrateAccountFromSupabaseProfile(account, verified);
      await this.repo.markPhoneVerifiedByAccountId(account.id);

      await this.writeAuditEventBestEffort({
        accountId: account.id,
        phone,
        eventKey: "AUTH_OTP_VERIFY",
        outcome: "SUCCESS",
      });
      return { verified: true };
    } catch (error) {
      const account = await this.repo.findAccountByPhone(phone);
      await this.writeAuditEventBestEffort({
        accountId: account?.id ?? null,
        phone,
        eventKey: "AUTH_OTP_VERIFY",
        outcome: "FAILED",
        reasonCode: "SUPABASE_OTP_VERIFY_FAILED",
      });
      throw this.translateSupabaseError(error);
    }
  }

  private async verifyRegistrationOtpWithFixedFallback(
    phone: string
  ): Promise<{ verified: true }> {
    const account = await this.repo.findAccountByPhone(phone);
    if (!account) {
      await this.writeAuditEventBestEffort({
        phone,
        eventKey: "AUTH_OTP_VERIFY",
        outcome: "FAILED",
        reasonCode: "ACCOUNT_NOT_FOUND",
      });
      throw new V0AuthError(404, "account not found");
    }

    await this.repo.markPhoneVerifiedByAccountId(account.id);
    await this.writeAuditEventBestEffort({
      accountId: account.id,
      phone,
      eventKey: "AUTH_OTP_VERIFY",
      outcome: "SUCCESS",
      metadata: { verificationMode: "FIXED_FALLBACK" },
    });
    return { verified: true };
  }

  private async loginWithSupabase(input: {
    phone: string;
    password: string;
  }): Promise<{
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

    try {
      const supabase = this.requireSupabase();
      const session = await supabase.signInWithPassword({ phone, password });

      let account = await this.resolveSupabaseProjectedAccount({
        verifiedUserId: session.userId,
        phone,
      });
      if (!account || account.status !== "ACTIVE") {
        throw new V0AuthError(401, "invalid credentials");
      }

      account = await this.hydrateAccountFromSupabaseProfile(account, session);

      if (session.phoneConfirmedAt && !account.phone_verified_at) {
        await this.repo.markPhoneVerifiedByAccountId(account.id);
        account = (await this.repo.findAccountById(account.id)) ?? account;
      }

      if (!account.phone_verified_at) {
        throw new V0AuthError(403, "phone is not verified");
      }

      const activeMembershipsCount = await this.repo.countActiveMemberships(account.id);
      const context = { tenantId: null, branchId: null };

      await this.writeAuditEventBestEffort({
        accountId: account.id,
        phone,
        eventKey: "AUTH_LOGIN",
        outcome: "SUCCESS",
      });
      return this.issueSessionResponse(account, context, activeMembershipsCount);
    } catch (error) {
      if (error instanceof V0AuthError) {
        throw error;
      }
      await this.writeAuditEventBestEffort({
        phone,
        eventKey: "AUTH_LOGIN",
        outcome: "FAILED",
        reasonCode: "INVALID_CREDENTIALS",
      });
      throw this.translateSupabaseError(error, 401, "invalid credentials");
    }
  }

  private async requestPasswordResetWithSupabase(input: {
    phone: string;
  }): Promise<{ expiresInMinutes: number }> {
    const phone = normalizePhone(input.phone);
    if (!phone) {
      throw new V0AuthError(422, "phone is required");
    }

    const account = await this.getPasswordResetEligibleAccount(
      phone,
      "AUTH_PASSWORD_RESET_REQUEST"
    );

    try {
      const supabase = this.requireSupabase();
      await supabase.sendOtp(phone);
      await this.writeAuditEventBestEffort({
        accountId: account.id,
        phone,
        eventKey: "AUTH_PASSWORD_RESET_REQUEST",
        outcome: "SUCCESS",
      });
      return { expiresInMinutes: this.otpExpiryMinutes };
    } catch (error) {
      await this.writeAuditEventBestEffort({
        accountId: account.id,
        phone,
        eventKey: "AUTH_PASSWORD_RESET_REQUEST",
        outcome: "FAILED",
        reasonCode: "SUPABASE_OTP_SEND_FAILED",
      });
      throw this.translateSupabaseError(error);
    }
  }

  private async confirmPasswordResetWithSupabase(input: {
    phone: string;
    otp: string;
    newPassword: string;
  }): Promise<{ reset: true }> {
    const phone = normalizePhone(input.phone);
    const otp = String(input.otp ?? "").trim();
    const newPassword = String(input.newPassword ?? "");
    if (!phone || !otp || !newPassword) {
      throw new V0AuthError(422, "phone, otp, and newPassword are required");
    }
    if (!V0PasswordService.validatePasswordStrength(newPassword)) {
      throw new V0AuthError(422, "password must be at least 8 characters");
    }

    if (this.matchesFixedOtp(otp)) {
      return this.confirmPasswordResetWithSupabaseFixedFallback(phone, newPassword);
    }

    let account: V0AccountRow | null = null;

    try {
      const supabase = this.requireSupabase();
      const verified = await supabase.verifyOtp({ phone, otp });

      account = await this.resolveExistingSupabaseProjectedAccount({
        verifiedUserId: verified.userId,
        phone,
      });
      if (!this.isPasswordResetEligibleAccount(account)) {
        throw new V0AuthError(404, "account not found");
      }

      account = await this.hydrateAccountFromSupabaseProfile(account, verified);
      await supabase.updateUserPassword(account.supabase_user_id ?? verified.userId, newPassword);
      await this.repo.markPhoneVerifiedByAccountId(account.id);
      await this.repo.revokeSessionsByAccountId(account.id);

      await this.writeAuditEventBestEffort({
        accountId: account.id,
        phone,
        eventKey: "AUTH_PASSWORD_RESET_CONFIRM",
        outcome: "SUCCESS",
      });
      return { reset: true };
    } catch (error) {
      await this.writeAuditEventBestEffort({
        accountId: account?.id ?? null,
        phone,
        eventKey: "AUTH_PASSWORD_RESET_CONFIRM",
        outcome: "FAILED",
        reasonCode: "SUPABASE_PASSWORD_RESET_FAILED",
      });
      throw this.translateSupabaseError(error);
    }
  }

  private async confirmPasswordResetWithSupabaseFixedFallback(
    phone: string,
    newPassword: string
  ): Promise<{ reset: true }> {
    const account = await this.getPasswordResetEligibleAccount(
      phone,
      "AUTH_PASSWORD_RESET_CONFIRM"
    );
    if (!account.supabase_user_id) {
      await this.writeAuditEventBestEffort({
        accountId: account.id,
        phone,
        eventKey: "AUTH_PASSWORD_RESET_CONFIRM",
        outcome: "FAILED",
        reasonCode: "ACCOUNT_NOT_FOUND",
      });
      throw new V0AuthError(404, "account not found");
    }

    try {
      const supabase = this.requireSupabase();
      await supabase.updateUserPassword(account.supabase_user_id, newPassword);
      await this.repo.markPhoneVerifiedByAccountId(account.id);
      await this.repo.revokeSessionsByAccountId(account.id);

      await this.writeAuditEventBestEffort({
        accountId: account.id,
        phone,
        eventKey: "AUTH_PASSWORD_RESET_CONFIRM",
        outcome: "SUCCESS",
        metadata: { verificationMode: "FIXED_FALLBACK" },
      });
      return { reset: true };
    } catch (error) {
      await this.writeAuditEventBestEffort({
        accountId: account.id,
        phone,
        eventKey: "AUTH_PASSWORD_RESET_CONFIRM",
        outcome: "FAILED",
        reasonCode: "SUPABASE_PASSWORD_RESET_FAILED",
      });
      throw this.translateSupabaseError(error);
    }
  }

  private async requestPasswordResetWithLocalAuth(input: {
    phone: string;
  }): Promise<{ expiresInMinutes: number; debugOtp?: string }> {
    const phone = normalizePhone(input.phone);
    if (!phone) {
      throw new V0AuthError(422, "phone is required");
    }

    const account = await this.getPasswordResetEligibleAccount(
      phone,
      "AUTH_PASSWORD_RESET_REQUEST"
    );
    const latestOtp = await this.repo.findLatestPhoneOtpByPurpose(
      phone,
      this.passwordResetOtpPurpose
    );
    if (latestOtp) {
      const cooldownMs = this.otpResendCooldownSeconds * 1000;
      const remainingMs = latestOtp.created_at.getTime() + cooldownMs - Date.now();
      if (remainingMs > 0) {
        const retryAfterSeconds = Math.ceil(remainingMs / 1000);
        await this.writeAuditEventBestEffort({
          accountId: account.id,
          phone,
          eventKey: "AUTH_PASSWORD_RESET_REQUEST",
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
      purpose: this.passwordResetOtpPurpose,
      since: oneHourAgo,
    });
    if (sentInLastHour >= this.otpMaxPerHour) {
      await this.writeAuditEventBestEffort({
        accountId: account.id,
        phone,
        eventKey: "AUTH_PASSWORD_RESET_REQUEST",
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
      purpose: this.passwordResetOtpPurpose,
      codeHash,
      expiresAt,
      maxAttempts: this.otpMaxAttempts,
    });

    await this.writeAuditEventBestEffort({
      accountId: account.id,
      phone,
      eventKey: "AUTH_PASSWORD_RESET_REQUEST",
      outcome: "SUCCESS",
      metadata: { expiresInMinutes: this.otpExpiryMinutes },
    });

    return {
      expiresInMinutes: this.otpExpiryMinutes,
      ...(this.isOtpDebugMode() ? { debugOtp: otpCode } : {}),
    };
  }

  private async confirmPasswordResetWithLocalAuth(input: {
    phone: string;
    otp: string;
    newPassword: string;
  }): Promise<{ reset: true }> {
    const phone = normalizePhone(input.phone);
    const otp = String(input.otp ?? "").trim();
    const newPassword = String(input.newPassword ?? "");
    if (!phone || !otp || !newPassword) {
      throw new V0AuthError(422, "phone, otp, and newPassword are required");
    }
    if (!V0PasswordService.validatePasswordStrength(newPassword)) {
      throw new V0AuthError(422, "password must be at least 8 characters");
    }

    const account = await this.getPasswordResetEligibleAccount(
      phone,
      "AUTH_PASSWORD_RESET_CONFIRM"
    );
    const latestOtp = await this.repo.findLatestActivePhoneOtp(
      phone,
      this.passwordResetOtpPurpose
    );
    if (!latestOtp) {
      await this.writeAuditEventBestEffort({
        accountId: account.id,
        phone,
        eventKey: "AUTH_PASSWORD_RESET_CONFIRM",
        outcome: "FAILED",
        reasonCode: "OTP_NOT_FOUND",
      });
      throw new V0AuthError(400, "otp not found");
    }

    if (latestOtp.expires_at.getTime() <= Date.now()) {
      await this.writeAuditEventBestEffort({
        accountId: account.id,
        phone,
        eventKey: "AUTH_PASSWORD_RESET_CONFIRM",
        outcome: "FAILED",
        reasonCode: "OTP_EXPIRED",
      });
      throw new V0AuthError(400, "otp expired");
    }

    if (latestOtp.attempts >= latestOtp.max_attempts) {
      await this.writeAuditEventBestEffort({
        accountId: account.id,
        phone,
        eventKey: "AUTH_PASSWORD_RESET_CONFIRM",
        outcome: "FAILED",
        reasonCode: "OTP_ATTEMPTS_EXCEEDED",
      });
      throw new V0AuthError(400, "otp attempts exceeded");
    }

    if (sha256(otp) !== latestOtp.code_hash) {
      await this.repo.incrementPhoneOtpAttempts(latestOtp.id);
      await this.writeAuditEventBestEffort({
        accountId: account.id,
        phone,
        eventKey: "AUTH_PASSWORD_RESET_CONFIRM",
        outcome: "FAILED",
        reasonCode: "OTP_INVALID",
      });
      throw new V0AuthError(400, "invalid otp");
    }

    await this.repo.consumePhoneOtp(latestOtp.id);
    const passwordHash = await V0PasswordService.hashPassword(newPassword);
    await this.repo.updatePasswordHash({
      accountId: account.id,
      passwordHash,
    });
    await this.repo.markPhoneVerifiedByAccountId(account.id);
    await this.repo.revokeSessionsByAccountId(account.id);
    await this.writeAuditEventBestEffort({
      accountId: account.id,
      phone,
      eventKey: "AUTH_PASSWORD_RESET_CONFIRM",
      outcome: "SUCCESS",
    });
    return { reset: true };
  }

  private async changePasswordWithSupabase(input: {
    accountId: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<{ changed: true }> {
    const account = await this.getAuthenticatedAccountForPasswordChange(input.accountId);
    const currentPassword = String(input.currentPassword ?? "");
    const newPassword = String(input.newPassword ?? "");
    if (!currentPassword || !newPassword) {
      throw new V0AuthError(422, "currentPassword and newPassword are required");
    }
    if (!V0PasswordService.validatePasswordStrength(newPassword)) {
      throw new V0AuthError(422, "password must be at least 8 characters");
    }

    const supabase = this.requireSupabase();
    let verifiedSession;

    try {
      verifiedSession = await supabase.signInWithPassword({
        phone: account.phone,
        password: currentPassword,
      });
    } catch (error) {
      await this.writeAuditEventBestEffort({
        accountId: account.id,
        phone: account.phone,
        eventKey: "AUTH_PASSWORD_CHANGE",
        outcome: "FAILED",
        reasonCode: "CURRENT_PASSWORD_INVALID",
      });
      throw this.translateSupabaseError(error, 401, "invalid current password");
    }

    let targetUserId = account.supabase_user_id;
    if (!targetUserId) {
      targetUserId = verifiedSession.userId;
      await this.repo.attachSupabaseUserId({
        accountId: account.id,
        supabaseUserId: targetUserId,
      });
    }

    try {
      await supabase.updateUserPassword(targetUserId, newPassword);
      await this.repo.revokeSessionsByAccountId(account.id);
      await this.writeAuditEventBestEffort({
        accountId: account.id,
        phone: account.phone,
        eventKey: "AUTH_PASSWORD_CHANGE",
        outcome: "SUCCESS",
      });
      return { changed: true };
    } catch (error) {
      await this.writeAuditEventBestEffort({
        accountId: account.id,
        phone: account.phone,
        eventKey: "AUTH_PASSWORD_CHANGE",
        outcome: "FAILED",
        reasonCode: "SUPABASE_PASSWORD_CHANGE_FAILED",
      });
      throw this.translateSupabaseError(error);
    }
  }

  private async changePasswordWithLocalAuth(input: {
    accountId: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<{ changed: true }> {
    const account = await this.getAuthenticatedAccountForPasswordChange(input.accountId);
    const currentPassword = String(input.currentPassword ?? "");
    const newPassword = String(input.newPassword ?? "");
    if (!currentPassword || !newPassword) {
      throw new V0AuthError(422, "currentPassword and newPassword are required");
    }
    if (!V0PasswordService.validatePasswordStrength(newPassword)) {
      throw new V0AuthError(422, "password must be at least 8 characters");
    }

    const isValidPassword = await V0PasswordService.verifyPassword(
      currentPassword,
      account.password_hash ?? ""
    );
    if (!isValidPassword) {
      await this.writeAuditEventBestEffort({
        accountId: account.id,
        phone: account.phone,
        eventKey: "AUTH_PASSWORD_CHANGE",
        outcome: "FAILED",
        reasonCode: "CURRENT_PASSWORD_INVALID",
      });
      throw new V0AuthError(401, "invalid current password");
    }

    const passwordHash = await V0PasswordService.hashPassword(newPassword);
    await this.repo.updatePasswordHash({
      accountId: account.id,
      passwordHash,
    });
    await this.repo.revokeSessionsByAccountId(account.id);
    await this.writeAuditEventBestEffort({
      accountId: account.id,
      phone: account.phone,
      eventKey: "AUTH_PASSWORD_CHANGE",
      outcome: "SUCCESS",
    });
    return { changed: true };
  }

  private async registerWithLocalAuth(input: {
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

    if (!V0PasswordService.validatePasswordStrength(input.password)) {
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

      const passwordHash = await V0PasswordService.hashPassword(input.password);
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

    const passwordHash = await V0PasswordService.hashPassword(input.password);
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

  private async sendRegistrationOtpWithLocalAuth(input: {
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

    const latestOtp = await this.repo.findLatestPhoneOtpByPurpose(phone, this.otpPurpose);
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

  private async verifyRegistrationOtpWithLocalAuth(input: {
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

  private async loginWithLocalAuth(input: { phone: string; password: string }): Promise<{
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

    const isValidPassword = await V0PasswordService.verifyPassword(
      password,
      account.password_hash ?? ""
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

    const activeMembershipsCount = await this.repo.countActiveMemberships(account.id);
    const context = { tenantId: null, branchId: null };

    await this.writeAuditEventBestEffort({
      accountId: account.id,
      phone,
      eventKey: "AUTH_LOGIN",
      outcome: "SUCCESS",
    });
    return this.issueSessionResponse(account, context, activeMembershipsCount);
  }

  private isPasswordResetEligibleAccount(account: V0AccountRow | null): account is V0AccountRow {
    if (!account || account.status !== "ACTIVE") {
      return false;
    }

    return Boolean(
      account.password_hash
      || account.supabase_user_id
      || account.first_name
      || account.last_name
      || account.phone_verified_at
    );
  }

  private async getPasswordResetEligibleAccount(
    phone: string,
    eventKey: string
  ): Promise<V0AccountRow> {
    const account = await this.repo.findAccountByPhone(phone);
    const accountId = account?.id ?? null;
    if (this.isPasswordResetEligibleAccount(account)) {
      return account;
    }

    await this.writeAuditEventBestEffort({
      accountId,
      phone,
      eventKey,
      outcome: "FAILED",
      reasonCode: "ACCOUNT_NOT_FOUND",
    });
    throw new V0AuthError(404, "account not found");
  }

  private async getAuthenticatedAccountForPasswordChange(
    accountId: string
  ): Promise<V0AccountRow> {
    const normalizedAccountId = String(accountId ?? "").trim();
    if (!normalizedAccountId) {
      throw new V0AuthError(401, "invalid access token");
    }

    const account = await this.repo.findAccountById(normalizedAccountId);
    if (!account || account.status !== "ACTIVE") {
      await this.writeAuditEventBestEffort({
        accountId: normalizedAccountId,
        eventKey: "AUTH_PASSWORD_CHANGE",
        outcome: "FAILED",
        reasonCode: "ACCOUNT_INACTIVE",
      });
      throw new V0AuthError(401, "invalid access token");
    }

    return account;
  }

  private async resolveExistingSupabaseProjectedAccount(input: {
    verifiedUserId: string;
    phone: string;
  }): Promise<V0AccountRow | null> {
    const accountBySupabaseUserId = input.verifiedUserId
      ? await this.repo.findAccountBySupabaseUserId(input.verifiedUserId)
      : null;
    if (accountBySupabaseUserId) {
      return accountBySupabaseUserId;
    }

    const accountByPhone = await this.repo.findAccountByPhone(input.phone);
    if (!accountByPhone) {
      return null;
    }

    if (!accountByPhone.supabase_user_id && input.verifiedUserId) {
      await this.repo.attachSupabaseUserId({
        accountId: accountByPhone.id,
        supabaseUserId: input.verifiedUserId,
      });
      return {
        ...accountByPhone,
        supabase_user_id: input.verifiedUserId,
      };
    }

    return accountByPhone;
  }

  private async resolveSupabaseProjectedAccount(input: {
    verifiedUserId: string;
    phone: string;
  }): Promise<V0AccountRow | null> {
    const accountBySupabaseUserId = input.verifiedUserId
      ? await this.repo.findAccountBySupabaseUserId(input.verifiedUserId)
      : null;
    if (accountBySupabaseUserId) {
      return accountBySupabaseUserId;
    }

    const accountByPhone = await this.repo.findAccountByPhone(input.phone);
    if (accountByPhone) {
      if (!accountByPhone.supabase_user_id && input.verifiedUserId) {
        await this.repo.attachSupabaseUserId({
          accountId: accountByPhone.id,
          supabaseUserId: input.verifiedUserId,
        });
        return {
          ...accountByPhone,
          supabase_user_id: input.verifiedUserId,
        };
      }
      return accountByPhone;
    }

    if (!input.verifiedUserId) {
      return null;
    }

    try {
      const created = await this.repo.createInvitedAccount({
        phone: input.phone,
      });
      await this.repo.attachSupabaseUserId({
        accountId: created.id,
        supabaseUserId: input.verifiedUserId,
      });
      return {
        ...created,
        supabase_user_id: input.verifiedUserId,
      };
    } catch (error) {
      const uniqueViolation = (error as { code?: string } | null)?.code === "23505";
      if (!uniqueViolation) {
        throw error;
      }

      const retried = await this.repo.findAccountByPhone(input.phone);
      if (!retried) {
        throw error;
      }

      if (!retried.supabase_user_id) {
        await this.repo.attachSupabaseUserId({
          accountId: retried.id,
          supabaseUserId: input.verifiedUserId,
        });
        return {
          ...retried,
          supabase_user_id: input.verifiedUserId,
        };
      }

      return retried;
    }
  }

  private async findAccountByPhoneBestEffort(phone: string) {
    try {
      return await this.repo.findAccountByPhone(phone);
    } catch {
      return null;
    }
  }

  private async hydrateAccountFromSupabaseProfile(
    account: V0AccountRow,
    profile: {
      userId: string;
      phone: string | null;
      firstName: string | null;
      lastName: string | null;
      gender: string | null;
      dateOfBirth: string | null;
    }
  ): Promise<V0AccountRow> {
    const needsProjectionUpdate =
      (!account.supabase_user_id && Boolean(profile.userId)) ||
      (!account.first_name && Boolean(profile.firstName)) ||
      (!account.last_name && Boolean(profile.lastName)) ||
      (!account.gender && Boolean(profile.gender)) ||
      (!account.date_of_birth && Boolean(profile.dateOfBirth)) ||
      (profile.phone != null && profile.phone !== account.phone);

    if (!needsProjectionUpdate) {
      return account;
    }

    return this.repo.updateAccountProjectionFromSupabase({
      accountId: account.id,
      supabaseUserId: account.supabase_user_id ? null : profile.userId,
      phone: profile.phone != null && profile.phone !== account.phone ? profile.phone : null,
      firstName: account.first_name ? null : profile.firstName,
      lastName: account.last_name ? null : profile.lastName,
      gender: account.gender ? null : profile.gender,
      dateOfBirth: account.date_of_birth ? null : profile.dateOfBirth,
    });
  }

  private translateSupabaseError(
    error: unknown,
    fallbackStatusCode = 400,
    fallbackMessage = "supabase auth request failed"
  ): V0AuthError {
    if (error instanceof V0AuthError) {
      return error;
    }
    if (error instanceof SupabaseAuthError) {
      if (error.statusCode === 400) {
        return new V0AuthError(400, error.message);
      }
      if (error.statusCode === 401) {
        return new V0AuthError(401, error.message);
      }
      if (error.statusCode === 422) {
        return new V0AuthError(422, error.message);
      }
      if (error.statusCode === 429) {
        return new V0AuthError(429, error.message);
      }
      return new V0AuthError(502, error.message);
    }
    return new V0AuthError(fallbackStatusCode, fallbackMessage);
  }
}
