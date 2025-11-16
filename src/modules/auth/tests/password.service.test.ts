import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PasswordService } from '../app/password.service.js';

describe('PasswordService', () => {
  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const password = 'TestPassword123!';
      const hash = await PasswordService.hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should generate different hashes for the same password', async () => {
      const password = 'TestPassword123!';
      const hash1 = await PasswordService.hashPassword(password);
      const hash2 = await PasswordService.hashPassword(password);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const password = 'TestPassword123!';
      const hash = await PasswordService.hashPassword(password);
      
      const isValid = await PasswordService.verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'TestPassword123!';
      const wrongPassword = 'WrongPassword123!';
      const hash = await PasswordService.hashPassword(password);
      
      const isValid = await PasswordService.verifyPassword(wrongPassword, hash);
      expect(isValid).toBe(false);
    });
  });

  describe('validatePasswordStrength', () => {
    it('should validate password with default minimum length', () => {
      expect(PasswordService.validatePasswordStrength('12345678')).toBe(true);
      expect(PasswordService.validatePasswordStrength('1234567')).toBe(false);
    });

    it('should validate password with custom minimum length', () => {
      expect(PasswordService.validatePasswordStrength('12345', 5)).toBe(true);
      expect(PasswordService.validatePasswordStrength('1234', 5)).toBe(false);
    });
  });
});
