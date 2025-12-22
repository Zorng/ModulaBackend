import { describe, expect, it, jest } from "@jest/globals";
import { TenantProvisioningService } from "../app/tenant-provisioning.service.js";

function createMockPool() {
  const client = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  };
  const pool = {
    connect: jest.fn().mockResolvedValue(client),
    query: jest.fn().mockResolvedValue({ rows: [] }),
  };
  return { pool, client };
}

describe("TenantProvisioningService", () => {
  it("rolls back when membership provisioning fails", async () => {
    const { pool, client } = createMockPool();

    const repo = {
      createTenant: jest.fn().mockResolvedValue({
        id: "tenant-1",
        name: "Test Tenant",
        business_type: null,
        status: "ACTIVE",
        created_at: new Date(),
        updated_at: new Date(),
      }),
      ensureTenantLimits: jest.fn().mockResolvedValue(undefined),
    };

    const auditWriter = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    const branchProvisioning = {
      provisionBranch: jest.fn().mockResolvedValue({
        id: "branch-1",
        tenant_id: "tenant-1",
        name: "Main Branch",
        address: null,
        contact_phone: null,
        contact_email: null,
        status: "ACTIVE",
        created_at: new Date(),
        updated_at: new Date(),
      }),
    };

    const membershipProvisioning = {
      createInitialAdminMembership: jest
        .fn()
        .mockRejectedValue(new Error("membership failed")),
    };

    const policyDefaults = {
      ensureDefaultPolicies: jest.fn().mockResolvedValue(undefined),
    };

    const service = new TenantProvisioningService(
      pool as any,
      repo as any,
      auditWriter as any,
      membershipProvisioning as any,
      branchProvisioning as any,
      policyDefaults as any
    );

    await expect(
      service.provisionTenant({
        name: "Test Tenant",
        accountId: "acc-1",
        phone: "+123",
        firstName: "A",
        lastName: "B",
        passwordHash: "hash",
      })
    ).rejects.toThrow("membership failed");

    expect(client.query).toHaveBeenCalledWith("BEGIN");
    expect(branchProvisioning.provisionBranch).toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.query).not.toHaveBeenCalledWith("COMMIT");
    expect(policyDefaults.ensureDefaultPolicies).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("cleans up tenant if policy seeding fails after commit", async () => {
    const { pool, client } = createMockPool();

    const repo = {
      createTenant: jest.fn().mockResolvedValue({
        id: "tenant-1",
        name: "Test Tenant",
        business_type: null,
        status: "ACTIVE",
        created_at: new Date(),
        updated_at: new Date(),
      }),
      ensureTenantLimits: jest.fn().mockResolvedValue(undefined),
    };

    const auditWriter = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    const branchProvisioning = {
      provisionBranch: jest.fn().mockResolvedValue({
        id: "branch-1",
        tenant_id: "tenant-1",
        name: "Main Branch",
        address: null,
        contact_phone: null,
        contact_email: null,
        status: "ACTIVE",
        created_at: new Date(),
        updated_at: new Date(),
      }),
    };

    const membershipProvisioning = {
      createInitialAdminMembership: jest.fn().mockResolvedValue({
        employee: {
          id: "emp-1",
          account_id: "acc-1",
          tenant_id: "tenant-1",
          phone: "+123",
          password_hash: "hash",
          first_name: "A",
          last_name: "B",
          status: "ACTIVE",
          created_at: new Date(),
          updated_at: new Date(),
        },
        role: "ADMIN",
      }),
    };

    const policyDefaults = {
      ensureDefaultPolicies: jest
        .fn()
        .mockRejectedValue(new Error("policy seed failed")),
    };

    const service = new TenantProvisioningService(
      pool as any,
      repo as any,
      auditWriter as any,
      membershipProvisioning as any,
      branchProvisioning as any,
      policyDefaults as any
    );

    await expect(
      service.provisionTenant({
        name: "Test Tenant",
        accountId: "acc-1",
        phone: "+123",
        firstName: "A",
        lastName: "B",
        passwordHash: "hash",
      })
    ).rejects.toThrow("policy seed failed");

    expect(client.query).toHaveBeenCalledWith("BEGIN");
    expect(branchProvisioning.provisionBranch).toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(pool.query).toHaveBeenCalledWith(
      "DELETE FROM tenants WHERE id = $1",
      ["tenant-1"]
    );
  });
});
