import { Request, Response } from 'express';
import { AuthService } from '../../app/auth.service.js';
import { AuthRequest } from '../middleware/auth.middleware.js';

export class AuthController {
    constructor(private authService: AuthService) {}

    requestRegisterTenantOtp = async (req: Request, res: Response) => {
        try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(422).json({
            error: "Phone is required"
            });
        }

        const result = await this.authService.requestRegisterTenantOtp(phone);
        res.json(result);
        } catch (error) {
        res.status(400).json({
            error: "Failed to request OTP"
        });
        }
    };

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

    forgotPassword = async (req: Request, res: Response) => {
        try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(422).json({
            error: "Phone is required"
            });
        }

        const result = await this.authService.requestForgotPasswordOtp(phone);
        res.json(result);
        } catch (error) {
        res.status(400).json({
            error: "Failed to request OTP"
        });
        }
    };

    confirmForgotPassword = async (req: Request, res: Response) => {
        try {
        const { phone, otp, new_password } = req.body;

        if (!phone || !otp || !new_password) {
            return res.status(422).json({
            error: "Phone, otp, and new_password are required"
            });
        }

        const result = await this.authService.confirmForgotPassword({
            phone,
            otp,
            newPassword: new_password,
        });

        if (result.kind === "tenant_selection_required") {
            return res.json({
                requires_tenant_selection: true,
                selection_token: result.selectionToken,
                memberships: result.memberships
            });
        }

        return res.json({
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
        res.status(400).json({
            error: (error as Error).message
        });
        }
    };

    selectTenant = async (req: Request, res: Response) => {
        try {
            const { selection_token, tenant_id, branch_id } = req.body;

            if (!selection_token || !tenant_id) {
                return res.status(422).json({
                    error: "selection_token and tenant_id are required"
                });
            }

            const result = await this.authService.selectTenant({
                selectionToken: selection_token,
                tenantId: tenant_id,
                branchId: branch_id,
            });

            return res.json({
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
            res.status(400).json({
                error: (error as Error).message
            });
        }
    };

    listMemberships = async (req: AuthRequest, res: Response) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: "Authentication required" });
            }

            const result = await this.authService.listMemberships({
                employeeId: req.user.employeeId,
            });

            return res.json({
                success: true,
                data: {
                    account_id: result.accountId,
                    memberships: result.memberships.map((m) => ({
                        tenant: m.tenant,
                        employee: m.employee,
                        branch_assignments: m.branchAssignments,
                    })),
                },
            });
        } catch (error) {
            return res.status(400).json({
                error: (error as Error).message,
            });
        }
    };

    switchTenant = async (req: AuthRequest, res: Response) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: "Authentication required" });
            }

            const { tenant_id, branch_id } = req.body ?? {};
            if (!tenant_id || typeof tenant_id !== "string") {
                return res.status(422).json({ error: "tenant_id is required" });
            }

            const result = await this.authService.switchTenant({
                requesterEmployeeId: req.user.employeeId,
                tenantId: tenant_id,
                branchId: typeof branch_id === "string" ? branch_id : undefined,
            });

            return res.json({
                employee: {
                    id: result.employee.id,
                    first_name: result.employee.first_name,
                    last_name: result.employee.last_name,
                    phone: result.employee.phone,
                    status: result.employee.status,
                },
                tokens: result.tokens,
                branch_assignments: result.branchAssignments,
            });
        } catch (error) {
            return res.status(400).json({
                error: (error as Error).message,
            });
        }
    };

    switchBranch = async (req: AuthRequest, res: Response) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: "Authentication required" });
            }

            const { branch_id } = req.body ?? {};
            if (!branch_id || typeof branch_id !== "string") {
                return res.status(422).json({ error: "branch_id is required" });
            }

            const result = await this.authService.switchBranch({
                employeeId: req.user.employeeId,
                branchId: branch_id,
            });

            return res.json({
                employee: {
                    id: result.employee.id,
                    first_name: result.employee.first_name,
                    last_name: result.employee.last_name,
                    phone: result.employee.phone,
                    status: result.employee.status,
                },
                tokens: result.tokens,
                branch_assignments: result.branchAssignments,
            });
        } catch (error) {
            return res.status(400).json({
                error: (error as Error).message,
            });
        }
    };

    changePassword = async (req: AuthRequest, res: Response) => {
        try {
        if (!req.user) {
            return res.status(401).json({ error: "Authentication required" });
        }

        const { current_password, new_password } = req.body;

        if (!current_password || !new_password) {
            return res.status(422).json({
            error: "current_password and new_password are required"
            });
        }

        const result = await this.authService.changePassword({
            employeeId: req.user.employeeId,
            currentPassword: current_password,
            newPassword: new_password,
        });

        res.json({ tokens: result.tokens });
        } catch (error) {
        res.status(400).json({
            error: (error as Error).message
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

        if (result.kind === "tenant_selection_required") {
            return res.json({
                requires_tenant_selection: true,
                selection_token: result.selectionToken,
                memberships: result.memberships
            });
        }

        return res.json({
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
}
