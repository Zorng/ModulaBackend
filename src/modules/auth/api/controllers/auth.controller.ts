import { Request, Response } from 'express';
import { AuthService } from '../../app/auth.service.js';
import { AuthRequest } from '../middleware/auth.middleware.js';

export class AuthController {
    constructor(private authService: AuthService) {}

    registerTenant = async (req: Request, res: Response) => {
        try {
        const { business_name, phone, first_name, last_name, password, business_type } = req.body;

        if (!business_name || !phone || !first_name || !last_name || !password) {
            return res.status(422).json({
            error: 'All fields are required'
            });
        }

        const result = await this.authService.registerTenant({
            business_name,
            phone,
            first_name,
            last_name,
            password,
            business_type
        });

        res.status(201).json({
            tenant: result.tenant,
            employee: {
            id: result.employee.id,
            first_name: result.employee.first_name,
            last_name: result.employee.last_name,
            phone: result.employee.phone,
            status: result.employee.status
            },
            tokens: result.tokens
        });
        } catch (error) {
        res.status(409).json({
            error: 'Failed to register tenant: ' + (error as Error).message
        });
        }
    };

    login = async (req: Request, res: Response) => {
        try {
        const { phone, password } = req.body;

        if (!phone || !password) {
            return res.status(422).json({
            error: 'Phone and password are required'
            });
        }

        const result = await this.authService.login({ phone, password });

        res.json({
            employee: {
            id: result.employee.id,
            first_name: result.employee.first_name,
            last_name: result.employee.last_name,
            phone: result.employee.phone,
            status: result.employee.status
            },
            tokens: result.tokens,
            branch_assignments: result.branchAssignments
        });
        } catch (error) {
        res.status(401).json({
            error: 'Invalid credentials'
        });
        }
    };

    refreshToken = async (req: Request, res: Response) => {
        try {
        const { refresh_token } = req.body;

        if (!refresh_token) {
            return res.status(422).json({
            error: 'Refresh token is required'
            });
        }

        const tokens = await this.authService.refreshTokens(refresh_token);

        res.json({ tokens });
        } catch (error) {
        res.status(401).json({
            error: 'Invalid refresh token'
        });
        }
    };

    logout = async (req: Request, res: Response) => {
        try {
        const { refresh_token } = req.body;

        if (!refresh_token) {
            return res.status(422).json({
            error: 'Refresh token is required'
            });
        }

        await this.authService.logout(refresh_token);

        res.json({ message: 'Logged out successfully' });
        } catch (error) {
        res.status(400).json({
            error: 'Logout failed'
        });
        }
    };

    createInvite = async (req: AuthRequest, res: Response) => {
        try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const { first_name, last_name, phone, role, branch_id, note, expires_in_hours } = req.body;

        if (!first_name || !last_name || !phone || !role || !branch_id) {
            return res.status(422).json({
            error: 'First name, last name, phone, role, and branch are required'
            });
        }

        const invite = await this.authService.createInvite(
            req.user.tenantId,
            req.user.employeeId,
            { first_name, last_name, phone, role, branch_id, note, expires_in_hours }
        );

        res.status(201).json({
            invite: {
            id: invite.id,
            first_name: invite.first_name,
            last_name: invite.last_name,
            phone: invite.phone,
            role: invite.role,
            branch_id: invite.branch_id,
            expires_at: invite.expires_at
            },
            invite_token: invite.token_hash
        });
        } catch (error) {
        res.status(409).json({
            error: 'Failed to create invite: ' + (error as Error).message
        });
        }
    };

    acceptInvite = async (req: Request, res: Response) => {
        try {
        const { token } = req.params;
        const { password } = req.body;

        if (!token || !password) {
            return res.status(422).json({
            error: 'Invite token and password are required'
            });
        }

        const result = await this.authService.acceptInvite(token, { password });

        res.json({
            employee: {
            id: result.employee.id,
            first_name: result.employee.first_name,
            last_name: result.employee.last_name,
            phone: result.employee.phone,
            status: result.employee.status
            },
            tokens: result.tokens
        });
        } catch (error) {
        res.status(409).json({
            error: 'Failed to accept invite: ' + (error as Error).message
        });
        }
    };

    revokeInvite = async (req: AuthRequest, res: Response) => {
        try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const { inviteId } = req.params;
        const invite = await this.authService.revokeInvite(req.user.tenantId, inviteId, req.user.employeeId);

        res.json({ invite });
        } catch (error) {
        res.status(409).json({
            error: 'Failed to revoke invite: ' + (error as Error).message
        });
        }
    };
}