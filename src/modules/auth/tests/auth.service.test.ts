import { describe, it, expect } from '@jest/globals';
import { TokenService } from '../domain/token.service.js';
import { PasswordService } from '../domain/password.service.js';

describe('AuthService Unit Tests', () => {
  describe('Token and Password Services Integration', () => {
    it('should hash password and generate tokens for auth flow', async () => {
      const password = 'TestPass123!';
      const hash = await PasswordService.hashPassword(password);
      
      const tokenService = new TokenService('test-secret', 'test-refresh-secret', '1h', '7d');
      const accessToken = tokenService.generateAccessToken({
        userId: 'user-123',
        tenantId: 'tenant-123',
        branchId: 'branch-123',
        role: 'ADMIN'
      });

      const refreshToken = tokenService.generateRefreshToken();

      expect(hash).toBeDefined();
      expect(accessToken).toBeDefined();
      expect(refreshToken).toBeDefined();

      // Verify password
      const isValid = await PasswordService.verifyPassword(password, hash);
      expect(isValid).toBe(true);

      // Verify token
      const claims = tokenService.verifyAccessToken(accessToken);
      expect(claims).not.toBeNull();
      expect(claims?.userId).toBe('user-123');
    });

    it('should validate complete authentication cycle', async () => {
      // Step 1: User registers - password is hashed
      const userPassword = 'SecurePassword123!';
      const storedHash = await PasswordService.hashPassword(userPassword);

      // Step 2: User logs in - password is verified
      const loginAttempt = 'SecurePassword123!';
      const isAuthenticated = await PasswordService.verifyPassword(loginAttempt, storedHash);
      expect(isAuthenticated).toBe(true);

      // Step 3: Generate tokens on successful login
      const tokenService = new TokenService('secret', 'refresh-secret');
      const tokens = {
        accessToken: tokenService.generateAccessToken({
          userId: 'user-456',
          tenantId: 'tenant-456',
          role: 'CASHIER'
        }),
        refreshToken: tokenService.generateRefreshToken()
      };

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();

      // Step 4: Verify access token
      const verifiedClaims = tokenService.verifyAccessToken(tokens.accessToken);
      expect(verifiedClaims).not.toBeNull();
      expect(verifiedClaims?.role).toBe('CASHIER');
    });

    it('should reject wrong password', async () => {
      const correctPassword = 'Correct123!';
      const wrongPassword = 'Wrong123!';
      
      const hash = await PasswordService.hashPassword(correctPassword);
      const isValid = await PasswordService.verifyPassword(wrongPassword, hash);
      
      expect(isValid).toBe(false);
    });
  });
});
