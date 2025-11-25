import express from 'express';
import { AuthController } from './controllers/auth.controller.js';
import { AuthMiddleware } from './middleware/auth.middleware.js';
import { AuthService } from '../app/auth.service.js';
import { AuthRepository } from '../infra/repository.js';
import { TokenService } from '../app/token.service.js';
import { pool } from '#db';
import { config } from '../../../platform/config/index.js';

export function createAuthRouter(): express.Router {
    const router = express.Router();
    
    // Initialize dependencies
    const authRepo = new AuthRepository(pool);
    const tokenService = new TokenService(
        config.jwt.secret,
        config.jwt.refreshSecret,
        config.jwt.accessTokenExpiry,
        config.jwt.refreshTokenExpiry
    );
    const authService = new AuthService(authRepo, tokenService, config.auth.defaultInviteExpiryHours);
    const authController = new AuthController(authService);
    const authMiddleware = new AuthMiddleware(tokenService, authRepo);

    // Public routes
    
    /**
     * @openapi
     * /v1/auth/register-tenant:
     *   post:
     *     tags:
     *       - Authentication
     *     summary: Register a new tenant
     *     description: Creates a new tenant account with an admin user. This is the first step for onboarding a new business.
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/RegisterTenantRequest'
     *     responses:
     *       201:
     *         description: Tenant successfully registered
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/RegisterTenantResponse'
     *       409:
     *         description: Registration failed (e.g., phone number already exists)
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       422:
     *         description: Validation error - missing required fields
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.post('/register-tenant', authController.registerTenant);
    
    /**
     * @openapi
     * /v1/auth/login:
     *   post:
     *     tags:
     *       - Authentication
     *     summary: Login with phone and password
     *     description: Authenticates an employee and returns access/refresh tokens along with branch assignments
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/LoginRequest'
     *     responses:
     *       200:
     *         description: Login successful
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/LoginResponse'
     *       401:
     *         description: Invalid credentials
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       422:
     *         description: Validation error - missing phone or password
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.post('/login', authController.login);
    
    /**
     * @openapi
     * /v1/auth/refresh:
     *   post:
     *     tags:
     *       - Authentication
     *     summary: Refresh access token
     *     description: Exchanges a valid refresh token for new access and refresh tokens
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/RefreshTokenRequest'
     *     responses:
     *       200:
     *         description: Tokens refreshed successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/RefreshTokenResponse'
     *       401:
     *         description: Invalid or expired refresh token
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       422:
     *         description: Validation error - refresh token not provided
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.post('/refresh', authController.refreshToken);
    
    /**
     * @openapi
     * /v1/auth/logout:
     *   post:
     *     tags:
     *       - Authentication
     *     summary: Logout user
     *     description: Invalidates the provided refresh token, effectively logging out the user
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/LogoutRequest'
     *     responses:
     *       200:
     *         description: Logout successful
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/LogoutResponse'
     *       400:
     *         description: Logout failed
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       422:
     *         description: Validation error - refresh token not provided
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.post('/logout', authController.logout);
    
    // Invite routes - must come after /refresh and /logout to avoid conflicts
    
    /**
     * @openapi
     * /v1/auth/invites/accept/{token}:
     *   post:
     *     tags:
     *       - Authentication
     *     summary: Accept an employee invite
     *     description: Allows an invited employee to accept their invitation by setting a password and activating their account
     *     parameters:
     *       - in: path
     *         name: token
     *         required: true
     *         schema:
     *           type: string
     *         description: Invitation token received by the employee
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/AcceptInviteRequest'
     *     responses:
     *       200:
     *         description: Invite accepted successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/AcceptInviteResponse'
     *       409:
     *         description: Failed to accept invite (e.g., expired or already used)
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       422:
     *         description: Validation error - missing token or password
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.post('/invites/accept/:token', authController.acceptInvite);

    // Protected routes
    router.use(authMiddleware.authenticate);

    // Admin routes - Invite management
    
    /**
     * @openapi
     * /v1/auth/invites:
     *   post:
     *     tags:
     *       - Invites
     *     summary: Create employee invite
     *     description: Creates an invitation for a new employee to join a branch. Returns an invite token that must be sent to the invitee.
     *     security:
     *       - BearerAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/CreateInviteRequest'
     *     responses:
     *       201:
     *         description: Invite created successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/CreateInviteResponse'
     *       401:
     *         description: Authentication required
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       403:
     *         description: Insufficient permissions - ADMIN role required
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       409:
     *         description: Failed to create invite (e.g., phone already exists)
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       422:
     *         description: Validation error - missing required fields
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.post('/invites', 
        authMiddleware.requireRole(['ADMIN']),
        authController.createInvite
    );

    /**
     * @openapi
     * /v1/auth/invites/{inviteId}/resend:
     *   post:
     *     tags:
     *       - Invites
     *     summary: Resend an invite
     *     description: Regenerates and returns a new invite token for an existing invitation. The old token is invalidated.
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: inviteId
     *         required: true
     *         schema:
     *           type: string
     *           format: uuid
     *         description: ID of the invite to resend
     *     responses:
     *       200:
     *         description: Invite resent successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/CreateInviteResponse'
     *       401:
     *         description: Authentication required
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       403:
     *         description: Insufficient permissions - ADMIN role required
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       409:
     *         description: Failed to resend invite
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.post('/invites/:inviteId/resend',
        authMiddleware.requireRole(['ADMIN']),
        authController.resendInvite
    );

    /**
     * @openapi
     * /v1/auth/invites/{inviteId}/revoke:
     *   post:
     *     tags:
     *       - Invites
     *     summary: Revoke an invite
     *     description: Revokes an invitation, making it no longer usable. Cannot be undone.
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: inviteId
     *         required: true
     *         schema:
     *           type: string
     *           format: uuid
     *         description: ID of the invite to revoke
     *     responses:
     *       200:
     *         description: Invite revoked successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/InviteResponse'
     *       401:
     *         description: Authentication required
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       403:
     *         description: Insufficient permissions - ADMIN role required
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       409:
     *         description: Failed to revoke invite
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.post('/invites/:inviteId/revoke',
        authMiddleware.requireRole(['ADMIN']),
        authController.revokeInvite
    );

    // Admin routes - User management
    
    /**
     * @openapi
     * /v1/auth/users/{userId}/assign-branch:
     *   post:
     *     tags:
     *       - User Management
     *     summary: Assign employee to branch
     *     description: Creates a new branch assignment for an employee with a specified role
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: userId
     *         required: true
     *         schema:
     *           type: string
     *           format: uuid
     *         description: ID of the employee to assign
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/AssignBranchRequest'
     *     responses:
     *       201:
     *         description: Branch assigned successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/AssignmentResponse'
     *       401:
     *         description: Authentication required
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       403:
     *         description: Insufficient permissions - ADMIN role required
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       409:
     *         description: Failed to assign branch
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       422:
     *         description: Validation error - missing branch_id or role
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.post('/users/:userId/assign-branch',
        authMiddleware.requireRole(['ADMIN']),
        authController.assignBranch
    );

    /**
     * @openapi
     * /v1/auth/users/{userId}/role:
     *   post:
     *     tags:
     *       - User Management
     *     summary: Update employee role
     *     description: Updates an employee's role for a specific branch assignment
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: userId
     *         required: true
     *         schema:
     *           type: string
     *           format: uuid
     *         description: ID of the employee
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/UpdateRoleRequest'
     *     responses:
     *       200:
     *         description: Role updated successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/AssignmentResponse'
     *       401:
     *         description: Authentication required
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       403:
     *         description: Insufficient permissions - ADMIN role required
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       409:
     *         description: Failed to update role
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       422:
     *         description: Validation error - missing branch_id or role
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.post('/users/:userId/role',
        authMiddleware.requireRole(['ADMIN']),
        authController.updateRole
    );

    /**
     * @openapi
     * /v1/auth/users/{userId}/disable:
     *   post:
     *     tags:
     *       - User Management
     *     summary: Disable employee account
     *     description: Disables an employee account, preventing them from logging in
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: userId
     *         required: true
     *         schema:
     *           type: string
     *           format: uuid
     *         description: ID of the employee to disable
     *     responses:
     *       200:
     *         description: Employee disabled successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/EmployeeResponse'
     *       401:
     *         description: Authentication required
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       403:
     *         description: Insufficient permissions - ADMIN role required
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       409:
     *         description: Failed to disable employee
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.post('/users/:userId/disable',
        authMiddleware.requireRole(['ADMIN']),
        authController.disableEmployee
    );

    return router;
}

export const authRouter = createAuthRouter();
