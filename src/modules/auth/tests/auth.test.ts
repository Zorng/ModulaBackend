import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { AuthService } from '../app/auth.service.js';
import { AuthRepository } from '../infra/repository.js';
import { TokenService } from '../app/token.service.js';
import { PgPolicyRepository } from '../../policy/infra/repository.js';
import { Pool } from 'pg';

describe('Auth Integration Tests', () => {
  let pool: Pool;
  let authRepo: AuthRepository;
  let policyRepo: PgPolicyRepository;
  let tokenService: TokenService;
  let authService: AuthService;

  beforeAll(async () => {
    // Setup test database connection
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/modula_test'
    });

    authRepo = new AuthRepository(pool);
    policyRepo = new PgPolicyRepository(pool);
    tokenService = new TokenService(
      'test-jwt-secret',
      'test-refresh-secret',
      '1h',
      '7d'
    );
    authService = new AuthService(authRepo, tokenService, policyRepo, 72);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('End-to-End Auth Flow', () => {
    it('should complete full registration and login flow', async () => {
      const testPhone = `+${Date.now()}`;
      
      // Register tenant
      const registrationResult = await authService.registerTenant({
        business_name: 'Test E2E Business',
        phone: testPhone,
        first_name: 'Test',
        last_name: 'User',
        password: 'SecurePass123!',
        business_type: 'RETAIL'
      });

      expect(registrationResult.tenant).toBeDefined();
      expect(registrationResult.employee).toBeDefined();
      expect(registrationResult.tokens).toBeDefined();

      // Login with the created user
      const loginResult = await authService.login({
        phone: testPhone,
        password: 'SecurePass123!'
      });

      expect(loginResult.employee.id).toBe(registrationResult.employee.id);
      expect(loginResult.tokens).toBeDefined();
      expect(loginResult.branchAssignments.length).toBeGreaterThan(0);
    });
  });
});

