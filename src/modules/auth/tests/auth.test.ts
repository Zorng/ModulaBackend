import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { AuthService } from '../app/auth.service.js';
import { AuthRepository } from '../infra/repository.js';
import { TokenService } from '../app/token.service.js';
import type { InvitationPort } from '../../../shared/ports/staff-management.js';
import { createMembershipProvisioningPort } from "../index.js";
import { TenantRepository } from "../../tenant/infra/repository.js";
import {
  createTenantProvisioningPort,
  TenantProvisioningService,
} from "../../tenant/app/tenant-provisioning.service.js";
import { bootstrapAuditModule } from "#modules/audit/index.js";
import { bootstrapBranchModule } from "#modules/branch/index.js";
import { Pool } from 'pg';

describe('Auth Integration Tests', () => {
  let pool: Pool;
  let authRepo: AuthRepository;
  let tokenService: TokenService;
  let authService: AuthService;

  beforeAll(async () => {
    // Setup test database connection
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/modula_test'
    });

    authRepo = new AuthRepository(pool);
    tokenService = new TokenService(
      'test-jwt-secret',
      'test-refresh-secret',
      '1h',
      '7d'
    );
    const invitationPort: InvitationPort = {
      peekValidInvite: async () => {
        throw new Error('not implemented');
      },
      acceptInvite: async () => {
        throw new Error('not implemented');
      },
    };
    const tenantRepo = new TenantRepository(pool);
    const membershipProvisioningPort = createMembershipProvisioningPort();
    const auditModule = bootstrapAuditModule(pool);
    const branchModule = bootstrapBranchModule(pool, {
      auditWriterPort: auditModule.auditWriterPort,
    });
    const tenantProvisioningPort = createTenantProvisioningPort(
      new TenantProvisioningService(
        pool,
        tenantRepo,
        auditModule.auditWriterPort,
        membershipProvisioningPort,
        branchModule.branchProvisioningPort,
        {
          ensureDefaultPolicies: async () => {},
        }
      )
    );

    authService = new AuthService(
      authRepo,
      tokenService,
      invitationPort,
      tenantProvisioningPort,
      auditModule.auditWriterPort
    );
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

      expect(loginResult.kind).toBe("single");
      if (loginResult.kind !== "single") {
        throw new Error("Expected single-tenant login result");
      }

      expect(loginResult.employee.id).toBe(registrationResult.employee.id);
      expect(loginResult.tokens).toBeDefined();
      expect(loginResult.branchAssignments.length).toBeGreaterThan(0);
    });
  });
});
