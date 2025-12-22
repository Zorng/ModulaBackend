import { describe, expect, it, jest } from "@jest/globals";
import { TenantService } from "../app/tenant.service.js";
import type { TenantRepository } from "../infra/repository.js";

function createMockRepo(): jest.Mocked<Pick<
  TenantRepository,
  | "getTenantProfile"
  | "getTenantMetadata"
  | "updateTenantProfile"
  | "updateTenantLogo"
>> {
  return {
    getTenantProfile: jest.fn(),
    getTenantMetadata: jest.fn(),
    updateTenantProfile: jest.fn(),
    updateTenantLogo: jest.fn(),
  };
}

describe("TenantService", () => {
  it("throws when tenant metadata is missing", async () => {
    const repo = createMockRepo();
    repo.getTenantMetadata.mockResolvedValue(null);
    const auditWriter = { write: jest.fn() };
    const service = new TenantService(repo as any, auditWriter as any);

    await expect(service.getMetadata("tenant-1")).rejects.toThrow(
      "Tenant not found"
    );
  });

  it("validates email format before updating", async () => {
    const repo = createMockRepo();
    const auditWriter = { write: jest.fn() };
    const service = new TenantService(repo as any, auditWriter as any);

    await expect(
      service.updateProfile({
        tenantId: "tenant-1",
        actorEmployeeId: "emp-1",
        updates: { contact_email: "not-an-email" },
      })
    ).rejects.toThrow("valid email address");

    expect(repo.updateTenantProfile).not.toHaveBeenCalled();
    expect(auditWriter.write).not.toHaveBeenCalled();
  });

  it("trims and updates name", async () => {
    const repo = createMockRepo();
    repo.updateTenantProfile.mockResolvedValue({
      id: "tenant-1",
      name: "My Shop",
      business_type: null,
      status: "ACTIVE",
      logo_url: null,
      contact_phone: null,
      contact_email: null,
      contact_address: null,
      created_at: new Date(),
      updated_at: new Date(),
    } as any);

    const auditWriter = { write: jest.fn().mockResolvedValue(undefined) };
    const serviceWithAudit = new TenantService(repo as any, auditWriter as any);

    await serviceWithAudit.updateProfile({
      tenantId: "tenant-1",
      actorEmployeeId: "emp-1",
      updates: { name: "  My Shop  " },
    });

    expect(repo.updateTenantProfile).toHaveBeenCalledWith("tenant-1", {
      name: "My Shop",
    });
    expect(auditWriter.write).toHaveBeenCalled();
  });

  it("rejects empty logoUrl", async () => {
    const repo = createMockRepo();
    const auditWriter = { write: jest.fn() };
    const service = new TenantService(repo as any, auditWriter as any);

    await expect(
      service.updateLogo({
        tenantId: "tenant-1",
        actorEmployeeId: "emp-1",
        logoUrl: "   ",
      })
    ).rejects.toThrow("logoUrl is required");

    expect(repo.updateTenantLogo).not.toHaveBeenCalled();
  });
});
