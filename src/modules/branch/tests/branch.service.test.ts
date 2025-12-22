import { describe, expect, it, jest } from "@jest/globals";
import { BranchFrozenError, BranchService } from "../app/branch.service.js";

function makeBranch(overrides?: Partial<any>) {
  return {
    id: "branch-1",
    tenant_id: "tenant-1",
    name: "Main Branch",
    address: null,
    contact_phone: null,
    contact_email: null,
    status: "ACTIVE",
    created_at: new Date("2025-01-01T00:00:00.000Z"),
    updated_at: new Date("2025-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("BranchService", () => {
  it("provisions a branch and writes audit log", async () => {
    const repo = {
      createBranch: jest.fn().mockResolvedValue(makeBranch()),
    };
    const auditWriter = { write: jest.fn().mockResolvedValue(undefined) };
    const service = new BranchService(repo as any, auditWriter as any);
    const client = { query: jest.fn() } as any;

    const branch = await service.provisionBranch({
      client,
      tenantId: "tenant-1",
      name: "  Main Branch  ",
    });

    expect(branch.id).toBe("branch-1");
    expect(repo.createBranch).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "tenant-1",
        name: "Main Branch",
        status: "ACTIVE",
      }),
      client
    );
    expect(auditWriter.write).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        branchId: "branch-1",
        actionType: "BRANCH_PROVISIONED",
        resourceType: "BRANCH",
        resourceId: "branch-1",
      }),
      client
    );
  });

  it("rejects provisioning with empty name", async () => {
    const repo = {
      createBranch: jest.fn(),
    };
    const auditWriter = { write: jest.fn() };
    const service = new BranchService(repo as any, auditWriter as any);

    await expect(
      service.provisionBranch({
        client: { query: jest.fn() } as any,
        tenantId: "tenant-1",
        name: "   ",
      })
    ).rejects.toThrow("name is required");
  });

  it("lists branches for tenant when role is ADMIN", async () => {
    const repo = {
      listBranchesForTenant: jest.fn().mockResolvedValue([makeBranch()]),
      listBranchesForEmployee: jest.fn(),
    };
    const auditWriter = { write: jest.fn() };
    const service = new BranchService(repo as any, auditWriter as any);

    const result = await service.listAccessibleBranches({
      tenantId: "tenant-1",
      employeeId: "emp-1",
      role: "ADMIN",
    });

    expect(result).toHaveLength(1);
    expect(repo.listBranchesForTenant).toHaveBeenCalledWith("tenant-1");
    expect(repo.listBranchesForEmployee).not.toHaveBeenCalled();
  });

  it("lists branches for employee when role is not ADMIN", async () => {
    const repo = {
      listBranchesForTenant: jest.fn(),
      listBranchesForEmployee: jest.fn().mockResolvedValue([makeBranch()]),
    };
    const auditWriter = { write: jest.fn() };
    const service = new BranchService(repo as any, auditWriter as any);

    const result = await service.listAccessibleBranches({
      tenantId: "tenant-1",
      employeeId: "emp-1",
      role: "CASHIER",
    });

    expect(result).toHaveLength(1);
    expect(repo.listBranchesForTenant).not.toHaveBeenCalled();
    expect(repo.listBranchesForEmployee).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      employeeId: "emp-1",
    });
  });

  it("updates profile with validation and writes audit log", async () => {
    const repo = {
      updateBranchProfile: jest.fn().mockResolvedValue(
        makeBranch({
          name: "New Name",
          contact_email: "owner@example.com",
        })
      ),
    };
    const auditWriter = { write: jest.fn().mockResolvedValue(undefined) };
    const service = new BranchService(repo as any, auditWriter as any);

    const updated = await service.updateBranchProfile({
      tenantId: "tenant-1",
      branchId: "branch-1",
      actorEmployeeId: "emp-1",
      updates: {
        name: "  New Name  ",
        contact_email: "owner@example.com",
      },
    });

    expect(updated.name).toBe("New Name");
    expect(repo.updateBranchProfile).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      branchId: "branch-1",
      updates: {
        name: "New Name",
        contact_email: "owner@example.com",
      },
    });
    expect(auditWriter.write).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "BRANCH_UPDATED",
        employeeId: "emp-1",
      })
    );
  });

  it("rejects invalid contact_email", async () => {
    const repo = {
      updateBranchProfile: jest.fn(),
    };
    const auditWriter = { write: jest.fn() };
    const service = new BranchService(repo as any, auditWriter as any);

    await expect(
      service.updateBranchProfile({
        tenantId: "tenant-1",
        branchId: "branch-1",
        actorEmployeeId: "emp-1",
        updates: { contact_email: "not-an-email" },
      })
    ).rejects.toThrow("contact_email is not a valid email address");
  });

  it("freezes and unfreezes a branch (audit included)", async () => {
    const repo = {
      setBranchStatus: jest
        .fn()
        .mockResolvedValueOnce(makeBranch({ status: "FROZEN" }))
        .mockResolvedValueOnce(makeBranch({ status: "ACTIVE" })),
    };
    const auditWriter = { write: jest.fn().mockResolvedValue(undefined) };
    const service = new BranchService(repo as any, auditWriter as any);

    const frozen = await service.freezeBranch({
      tenantId: "tenant-1",
      branchId: "branch-1",
      actorEmployeeId: "emp-1",
    });
    expect(frozen.status).toBe("FROZEN");
    expect(auditWriter.write).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "BRANCH_FROZEN" })
    );

    const unfrozen = await service.unfreezeBranch({
      tenantId: "tenant-1",
      branchId: "branch-1",
      actorEmployeeId: "emp-1",
    });
    expect(unfrozen.status).toBe("ACTIVE");
    expect(auditWriter.write).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "BRANCH_UNFROZEN" })
    );
  });

  it("assertBranchActive throws BranchFrozenError when frozen", async () => {
    const repo = {
      findBranchById: jest.fn().mockResolvedValue(makeBranch({ status: "FROZEN" })),
    };
    const auditWriter = { write: jest.fn() };
    const service = new BranchService(repo as any, auditWriter as any);

    await expect(
      service.assertBranchActive({ tenantId: "tenant-1", branchId: "branch-1" })
    ).rejects.toBeInstanceOf(BranchFrozenError);
  });
});
