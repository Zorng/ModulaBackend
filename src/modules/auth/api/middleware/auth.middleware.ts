import { Request, Response, NextFunction } from 'express';
import { TokenService } from '../../domain/token.service.js';
import { AuthRepository } from '../../infra/repository.js';

export interface AuthRequest extends Request {
    user?: {
        userId: string;
        tenantId: string;
        branchId?: string;
        role: string;
    };
    }

    export class AuthMiddleware {
    constructor(
        private tokenService: TokenService,
        private authRepo: AuthRepository
    ) {}

    authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing or invalid authorization header' });
        }

        const token = authHeader.substring(7);
        const claims = this.tokenService.verifyAccessToken(token);
        
        if (!claims) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        const user = await this.authRepo.findUserById(claims.userId);
        if (!user || user.status !== 'ACTIVE') {
            return res.status(401).json({ error: 'User not found or inactive' });
        }

        req.user = claims;
        next();
        } catch (error) {
        res.status(401).json({ error: 'Authentication failed' });
        }
    };

    requireRole = (allowedRoles: string[]) => {
        return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions for this action' });
        }

        next();
        };
    };
}