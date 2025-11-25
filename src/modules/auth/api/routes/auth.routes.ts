import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { AuthMiddleware } from '../middleware/auth.middleware.js';

export function createAuthRoutes(
    authController: AuthController,
    authMiddleware: AuthMiddleware
): Router {
    const router = Router();

    // Public routes
    router.post('/register-tenant', authController.registerTenant);
    router.post('/login', authController.login);
    router.post('/refresh', authController.refreshToken);
    router.post('/logout', authController.logout);
    router.post('/invites/accept/:token', authController.acceptInvite);

    // Protected routes (require authentication)
    router.use(authMiddleware.authenticate);

    // Admin only routes
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