import { Pool } from 'pg';
import { AuthRepository } from './infra/repository.js';
import { AuthService } from './domain/auth.service.js';
import { TokenService } from './domain/token.service.js';
import { AuthController } from './api/controllers/auth.controller.js';
import { AuthMiddleware } from './api/middleware/auth.middleware.js';
import { createAuthRoutes } from './api/routes/auth.routes.js';
import { config } from '../../platform/config/index.js';

export function setupAuthModule(db: Pool) {
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
        config.auth.defaultInviteExpiryHours
    );

    // Initialize controllers and middleware
    const authController = new AuthController(authService);
    const authMiddleware = new AuthMiddleware(tokenService, authRepo);

    // Create routes
    const authRoutes = createAuthRoutes(authController, authMiddleware);

    return {
        authRoutes,
        authMiddleware,
        authService
    };
}