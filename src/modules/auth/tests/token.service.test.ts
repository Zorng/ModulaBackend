import { describe, it, expect, beforeEach } from '@jest/globals';
import { TokenService } from '../domain/token.service.js';

describe('TokenService', () => {
  let tokenService: TokenService;
  const jwtSecret = 'test-jwt-secret-key-12345';
  const refreshSecret = 'test-refresh-secret-key-12345';

  beforeEach(() => {
    tokenService = new TokenService(jwtSecret, refreshSecret, '1h', '7d');
  });

  describe('generateAccessToken', () => {
    it('should generate a valid JWT access token', () => {
      const claims = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        branchId: 'branch-789',
        role: 'ADMIN' as const
      };

      const token = tokenService.generateAccessToken(claims);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should include claims in the token', () => {
      const claims = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        branchId: 'branch-789',
        role: 'CASHIER' as const
      };

      const token = tokenService.generateAccessToken(claims);
      const verified = tokenService.verifyAccessToken(token);

      expect(verified).not.toBeNull();
      expect(verified?.userId).toBe(claims.userId);
      expect(verified?.tenantId).toBe(claims.tenantId);
      expect(verified?.branchId).toBe(claims.branchId);
      expect(verified?.role).toBe(claims.role);
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a refresh token', () => {
      const token = tokenService.generateRefreshToken();

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('should generate unique refresh tokens', () => {
      const token1 = tokenService.generateRefreshToken();
      const token2 = tokenService.generateRefreshToken();

      expect(token1).not.toBe(token2);
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify a valid token', () => {
      const claims = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        branchId: 'branch-789',
        role: 'MANAGER' as const
      };

      const token = tokenService.generateAccessToken(claims);
      const verified = tokenService.verifyAccessToken(token);

      expect(verified).not.toBeNull();
      expect(verified?.userId).toBe(claims.userId);
    });

    it('should return null for invalid token', () => {
      const invalidToken = 'invalid.jwt.token';
      const verified = tokenService.verifyAccessToken(invalidToken);

      expect(verified).toBeNull();
    });

    it('should return null for token with wrong secret', () => {
      const wrongTokenService = new TokenService('wrong-secret', refreshSecret);
      const claims = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        branchId: 'branch-789',
        role: 'ADMIN' as const
      };

      const token = tokenService.generateAccessToken(claims);
      const verified = wrongTokenService.verifyAccessToken(token);

      expect(verified).toBeNull();
    });
  });

  describe('calculateRefreshTokenExpiry', () => {
    it('should calculate expiry date in the future', () => {
      const expiry = tokenService.calculateRefreshTokenExpiry();
      const now = new Date();

      expect(expiry).toBeInstanceOf(Date);
      expect(expiry.getTime()).toBeGreaterThan(now.getTime());
    });

    it('should respect custom expiry duration', () => {
      const shortExpiryService = new TokenService(jwtSecret, refreshSecret, '1h', '1d');
      const longExpiryService = new TokenService(jwtSecret, refreshSecret, '1h', '30d');

      const shortExpiry = shortExpiryService.calculateRefreshTokenExpiry();
      const longExpiry = longExpiryService.calculateRefreshTokenExpiry();

      expect(longExpiry.getTime()).toBeGreaterThan(shortExpiry.getTime());
    });
  });
});
