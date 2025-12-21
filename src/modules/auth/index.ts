import { Pool } from 'pg';
import { AuthRepository } from './infra/repository.js';
import { AuthService } from './app/auth.service.js';
import type { InvitationPort } from '../../shared/ports/staff-management.js';
import type { TenantProvisioningPort } from "../../shared/ports/tenant.js";
import { TokenService } from './app/token.service.js';
import { AuthController } from './api/controllers/auth.controller.js';
import { AuthMiddleware } from './api/middleware/auth.middleware.js';
import { createAuthRoutes } from './api/routes/auth.routes.js';
import { config } from '../../platform/config/index.js';
export { createMembershipProvisioningPort } from "./app/membership-provisioning.port.js";

// Shared auth middleware instance (initialized by setupAuthModule)
export let authMiddleware: AuthMiddleware;

export function setupAuthModule(
    db: Pool,
    deps: { invitationPort: InvitationPort; tenantProvisioningPort: TenantProvisioningPort }
) {
     // Initialize repositories
    const authRepo = new AuthRepository(db);

    // Initialize services
    const tokenService = new TokenService(
        config.jwt.secret,
        config.jwt.refreshSecret,
        config.jwt.accessTokenExpiry,
        config.jwt.refreshTokenExpiry
    );

    const authService = new AuthService(
        authRepo,
        tokenService,
        deps.invitationPort,
        deps.tenantProvisioningPort
    );

    // Initialize controllers and middleware
    const authController = new AuthController(authService);
    authMiddleware = new AuthMiddleware(tokenService, authRepo);

    // Create routes
    const authRoutes = createAuthRoutes(authController, authMiddleware);

    return {
        authRoutes,
        authMiddleware,
        authService
    };
}

// Re-export types
export { AuthMiddleware } from './api/middleware/auth.middleware.js';
