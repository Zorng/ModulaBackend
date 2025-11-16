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
    router.post('/register-tenant', authController.registerTenant);
    router.post('/login', authController.login);
    router.post('/refresh', authController.refreshToken);
    router.post('/logout', authController.logout);
    
    // Invite routes - must come after /refresh and /logout to avoid conflicts
    router.post('/invites/accept/:token', authController.acceptInvite);

    // Protected routes
    router.use(authMiddleware.authenticate);

    // Admin routes
    router.post('/invites', 
        authMiddleware.requireRole(['ADMIN']),
        authController.createInvite
    );

    router.post('/invites/:inviteId/revoke',
        authMiddleware.requireRole(['ADMIN']),
        authController.revokeInvite
    );

    return router;
}

export const authRouter = createAuthRouter();
