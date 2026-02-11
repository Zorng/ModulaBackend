import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { AuthMiddleware } from '../middleware/auth.middleware.js';

export function createAuthRoutes(
    authController: AuthController,
    authMiddleware: AuthMiddleware
): Router {
    const router = Router();

    // Public routes
    /**
     * @openapi
     * /v1/auth/register-tenant/request-otp:
     *   post:
     *     tags:
     *       - Authentication
     *     summary: Request OTP for tenant registration
     *     description: |
     *       Sends an SMS OTP to the provided phone number for tenant onboarding.
     *
     *       Note: In non-production environments the API may return `debugOtp` for developer testing.
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: "#/components/schemas/RequestOtpRequest"
     *     responses:
     *       200:
     *         description: OTP sent (or queued for delivery)
     *         content:
     *           application/json:
     *             schema:
     *               $ref: "#/components/schemas/RequestOtpResponse"
     *       422:
     *         description: Missing phone
     */
    router.post('/register-tenant/request-otp', authController.requestRegisterTenantOtp);

    /**
     * @openapi
     * /v1/auth/register-tenant:
     *   post:
     *     tags:
     *       - Authentication
     *     summary: Register tenant and create first admin membership
     *     description: |
     *       Creates a new tenant, a default branch, and an admin employee membership for the provided phone number.
     *       Returns access and refresh tokens for immediate sign-in.
     *
     *       Note: OTP verification for this step is still being finalized; see `POST /v1/auth/register-tenant/request-otp`.
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: "#/components/schemas/RegisterTenantRequest"
     *     responses:
     *       201:
     *         description: Tenant registered successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: "#/components/schemas/RegisterTenantResponse"
     *       422:
     *         description: Missing required fields
     *       409:
     *         description: Registration failed (conflict)
     */
    router.post('/register-tenant', authController.registerTenant);

    /**
     * @openapi
     * /v1/auth/login:
     *   post:
     *     tags:
     *       - Authentication
     *     summary: Login with phone + password
     *     description: |
     *       Logs in using account credentials. If the account belongs to multiple tenants,
     *       the response indicates that tenant selection is required.
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: "#/components/schemas/LoginRequest"
     *     responses:
     *       200:
     *         description: Logged in (single tenant) or tenant selection required
     *         content:
     *           application/json:
     *             schema:
     *               oneOf:
     *                 - $ref: "#/components/schemas/LoginResponse"
     *                 - $ref: "#/components/schemas/TenantSelectionRequiredResponse"
     *       401:
     *         description: Invalid credentials
     *       422:
     *         description: Missing phone or password
     */
    router.post('/login', authController.login);

    /**
     * @openapi
     * /v1/auth/select-tenant:
     *   post:
     *     tags:
     *       - Authentication
     *     summary: Select tenant after login
     *     description: |
     *       Exchanges a short-lived selection token (returned when multiple memberships exist)
     *       for normal session tokens scoped to the chosen tenant and branch context.
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: "#/components/schemas/SelectTenantRequest"
     *     responses:
     *       200:
     *         description: Tenant selected and tokens issued
     *         content:
     *           application/json:
     *             schema:
     *               $ref: "#/components/schemas/LoginResponse"
     *       400:
     *         description: Invalid or expired selection token
     *       422:
     *         description: Missing selection_token or tenant_id
     */
    router.post('/select-tenant', authController.selectTenant);

    /**
     * @openapi
     * /v1/auth/refresh:
     *   post:
     *     tags:
     *       - Authentication
     *     summary: Refresh access token
     *     description: |
     *       Issues a new access token (and refresh token, depending on implementation)
     *       using a valid refresh token.
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: "#/components/schemas/RefreshTokenRequest"
     *     responses:
     *       200:
     *         description: Tokens refreshed
     *         content:
     *           application/json:
     *             schema:
     *               $ref: "#/components/schemas/RefreshTokenResponse"
     *       401:
     *         description: Invalid refresh token
     *       422:
     *         description: Missing refresh_token
     */
    router.post('/refresh', authController.refreshToken);

    /**
     * @openapi
     * /v1/auth/logout:
     *   post:
     *     tags:
     *       - Authentication
     *     summary: Logout (revoke refresh token)
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: "#/components/schemas/LogoutRequest"
     *     responses:
     *       200:
     *         description: Logged out successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: "#/components/schemas/LogoutResponse"
     *       422:
     *         description: Missing refresh_token
     */
    router.post('/logout', authController.logout);

    /**
     * @openapi
     * /v1/auth/password/forgot:
     *   post:
     *     tags:
     *       - Authentication
     *     summary: Request OTP for forgot password
     *     description: Sends an SMS OTP to the phone number if an account exists.
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: "#/components/schemas/RequestOtpRequest"
     *     responses:
     *       200:
     *         description: OTP sent (or queued for delivery)
     *         content:
     *           application/json:
     *             schema:
     *               $ref: "#/components/schemas/RequestOtpResponse"
     *       422:
     *         description: Missing phone
     */
    router.post('/password/forgot', authController.forgotPassword);

    /**
     * @openapi
     * /v1/auth/password/forgot/confirm:
     *   post:
     *     tags:
     *       - Authentication
     *     summary: Confirm forgot password OTP and set new password
     *     description: |
     *       Verifies the OTP, sets a new password, and revokes all existing sessions.
     *       If multiple memberships exist, tenant selection will be required.
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: "#/components/schemas/ConfirmForgotPasswordRequest"
     *     responses:
     *       200:
     *         description: Password reset completed (single tenant) or tenant selection required
     *         content:
     *           application/json:
     *             schema:
     *               oneOf:
     *                 - $ref: "#/components/schemas/LoginResponse"
     *                 - $ref: "#/components/schemas/TenantSelectionRequiredResponse"
     *       422:
     *         description: Missing phone, otp, or new_password
     *       400:
     *         description: Invalid OTP or reset failed
     */
    router.post('/password/forgot/confirm', authController.confirmForgotPassword);

    /**
     * @openapi
     * /v1/auth/invites/accept/{token}:
     *   post:
     *     tags:
     *       - Invites
     *     summary: Accept an invitation (set password and activate membership)
     *     parameters:
     *       - in: path
     *         name: token
     *         required: true
     *         schema:
     *           type: string
     *         description: Invitation token
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: "#/components/schemas/AcceptInviteRequest"
     *     responses:
     *       200:
     *         description: Invite accepted and tokens issued
     *         content:
     *           application/json:
     *             schema:
     *               $ref: "#/components/schemas/AcceptInviteResponse"
     *       422:
     *         description: Missing token or password
     *       409:
     *         description: Invite invalid/expired/revoked or acceptance failed
     */
    router.post('/invites/accept/:token', authController.acceptInvite);

    // Protected routes (require authentication)
    router.use(authMiddleware.authenticate);

    /**
     * @openapi
     * /v1/auth/password/change:
     *   post:
     *     tags:
     *       - Authentication
     *     summary: Change password (logged-in)
     *     security:
     *       - BearerAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: "#/components/schemas/ChangePasswordRequest"
     *     responses:
     *       200:
     *         description: Password changed and new tokens issued
     *         content:
     *           application/json:
     *             schema:
     *               $ref: "#/components/schemas/ChangePasswordResponse"
     *       401:
     *         description: Authentication required
     *       422:
     *         description: Missing current_password or new_password
     *       400:
     *         description: Invalid current password or change failed
     */
    router.post('/password/change', authController.changePassword);

    return router;
}
