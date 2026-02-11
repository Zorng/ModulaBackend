import jwt, { SignOptions } from 'jsonwebtoken';
import * as crypto from 'crypto';
import { JWTClaims, EmployeeRole } from '../domain/entities.js';

interface TenantSelectionClaims {
    accountId: string;
    purpose: 'TENANT_SELECTION';
    exp: number;
    iat: number;
}

export class TokenService {
    constructor(
        private readonly jwtSecret: string,
        private readonly refreshTokenSecret: string,
        private readonly accessTokenExpiry: string = '12h',
        private readonly refreshTokenExpiry: string = '7d'
    ) {}

    generateAccessToken(claims: Omit<JWTClaims, 'exp' | 'iat'>): string {
        return jwt.sign(claims, this.jwtSecret, {
            expiresIn: this.accessTokenExpiry,
            issuer: 'modula-auth'
        } as SignOptions);
    }

    generateRefreshToken(): string {
        return crypto.randomBytes(64).toString('hex');
    }

    verifyAccessToken(token: string): JWTClaims | null {
        try {
        return jwt.verify(token, this.jwtSecret) as JWTClaims;
        } catch {
        return null;
        }
    }

    generateTenantSelectionToken(accountId: string, expiresIn: string = '10m'): string {
        return jwt.sign(
            { accountId, purpose: 'TENANT_SELECTION' },
            this.jwtSecret,
            { expiresIn, issuer: 'modula-auth' } as SignOptions
        );
    }

    verifyTenantSelectionToken(token: string): TenantSelectionClaims | null {
        try {
            const claims = jwt.verify(token, this.jwtSecret) as any;
            if (!claims || claims.purpose !== 'TENANT_SELECTION' || typeof claims.accountId !== 'string') {
                return null;
            }
            return claims as TenantSelectionClaims;
        } catch {
            return null;
        }
    }

    calculateRefreshTokenExpiry(): Date {
        const expiryMs = this.parseTimeToMs(this.refreshTokenExpiry);
        return new Date(Date.now() + expiryMs);
    }

    private parseTimeToMs(time: string): number {
        const units: { [key: string]: number } = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000
        };

        const match = time.match(/^(\d+)([smhd])$/);
        if (!match) {
        return 24 * 60 * 60 * 1000; // Default 24 hours
        }

        const value = parseInt(match[1]);
        const unit = match[2];
        return value * (units[unit] || 1000);
    }
}
