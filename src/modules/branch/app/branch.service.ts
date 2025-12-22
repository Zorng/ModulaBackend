import type { PoolClient } from "pg";
import type { Branch, BranchProfileUpdate, BranchStatus } from "../domain/entities.js";
import { BranchRepository } from "../infra/repository.js";

export class BranchFrozenError extends Error {
  readonly code = "BRANCH_FROZEN";
  constructor(message = "Branch is frozen") {
    super(message);
  }
}

export class BranchService {
  constructor(private repo: BranchRepository) {}

  async provisionBranch(params: {
    client: PoolClient;
    tenantId: string;
    name: string;
    address?: string | null;
    contact_phone?: string | null;
    contact_email?: string | null;
  }): Promise<Branch> {
    const name = params.name.trim();
    if (name.length === 0) {
      throw new Error("name is required");
    }

    const branch = await this.repo.createBranch(
      {
        tenant_id: params.tenantId,
        name,
        address: params.address ?? null,
        contact_phone: params.contact_phone ?? null,
        contact_email: params.contact_email ?? null,
        status: "ACTIVE",
      },
      params.client
    );

    await this.repo.writeAuditLog(
      {
        tenantId: branch.tenant_id,
        branchId: branch.id,
        actionType: "BRANCH_PROVISIONED",
        resourceType: "BRANCH",
        resourceId: branch.id,
        details: {
          name: branch.name,
        },
      },
      params.client
    );

    return branch;
  }

  async listAccessibleBranches(params: {
    tenantId: string;
    employeeId: string;
    role: string;
  }): Promise<Branch[]> {
    if (params.role === "ADMIN") {
      return this.repo.listBranchesForTenant(params.tenantId);
    }
    return this.repo.listBranchesForEmployee({
      tenantId: params.tenantId,
      employeeId: params.employeeId,
    });
  }

  async getBranch(params: { tenantId: string; branchId: string }): Promise<Branch> {
    const branch = await this.repo.findBranchById(params.tenantId, params.branchId);
    if (!branch) {
      throw new Error("Branch not found");
    }
    return branch;
  }

  async updateBranchProfile(params: {
    tenantId: string;
    branchId: string;
    actorEmployeeId: string;
    updates: BranchProfileUpdate;
  }): Promise<Branch> {
    const updates: BranchProfileUpdate = {};

    if (params.updates.name !== undefined) {
      if (typeof params.updates.name !== "string") {
        throw new Error("name must be a string");
      }
      const name = params.updates.name.trim();
      if (name.length === 0 || name.length > 255) {
        throw new Error("name must be between 1 and 255 characters");
      }
      updates.name = name;
    }

    if (params.updates.address !== undefined) {
      if (params.updates.address !== null && typeof params.updates.address !== "string") {
        throw new Error("address must be a string or null");
      }
      updates.address = params.updates.address ? params.updates.address.trim() : null;
    }

    if (params.updates.contact_phone !== undefined) {
      if (params.updates.contact_phone !== null && typeof params.updates.contact_phone !== "string") {
        throw new Error("contact_phone must be a string or null");
      }
      updates.contact_phone = params.updates.contact_phone
        ? params.updates.contact_phone.trim()
        : null;
    }

    if (params.updates.contact_email !== undefined) {
      if (params.updates.contact_email !== null && typeof params.updates.contact_email !== "string") {
        throw new Error("contact_email must be a string or null");
      }
      const normalized = params.updates.contact_email ? params.updates.contact_email.trim() : null;
      if (normalized && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        throw new Error("contact_email is not a valid email address");
      }
      updates.contact_email = normalized;
    }

    const updated = await this.repo.updateBranchProfile({
      tenantId: params.tenantId,
      branchId: params.branchId,
      updates,
    });

    await this.repo.writeAuditLog({
      tenantId: updated.tenant_id,
      branchId: updated.id,
      employeeId: params.actorEmployeeId,
      actionType: "BRANCH_UPDATED",
      resourceType: "BRANCH",
      resourceId: updated.id,
      details: {
        name: updated.name,
        address: updated.address ?? null,
        contact_phone: updated.contact_phone ?? null,
        contact_email: updated.contact_email ?? null,
      },
    });

    return updated;
  }

  async setBranchStatus(params: {
    tenantId: string;
    branchId: string;
    actorEmployeeId: string;
    status: BranchStatus;
  }): Promise<Branch> {
    const updated = await this.repo.setBranchStatus({
      tenantId: params.tenantId,
      branchId: params.branchId,
      status: params.status,
    });

    await this.repo.writeAuditLog({
      tenantId: updated.tenant_id,
      branchId: updated.id,
      employeeId: params.actorEmployeeId,
      actionType: params.status === "FROZEN" ? "BRANCH_FROZEN" : "BRANCH_UNFROZEN",
      resourceType: "BRANCH",
      resourceId: updated.id,
      details: {
        status: updated.status,
      },
    });

    return updated;
  }

  async freezeBranch(params: {
    tenantId: string;
    branchId: string;
    actorEmployeeId: string;
  }): Promise<Branch> {
    return this.setBranchStatus({
      tenantId: params.tenantId,
      branchId: params.branchId,
      actorEmployeeId: params.actorEmployeeId,
      status: "FROZEN",
    });
  }

  async unfreezeBranch(params: {
    tenantId: string;
    branchId: string;
    actorEmployeeId: string;
  }): Promise<Branch> {
    return this.setBranchStatus({
      tenantId: params.tenantId,
      branchId: params.branchId,
      actorEmployeeId: params.actorEmployeeId,
      status: "ACTIVE",
    });
  }

  async assertBranchActive(params: {
    tenantId: string;
    branchId: string;
  }): Promise<void> {
    const branch = await this.getBranch(params);
    if (branch.status === "FROZEN") {
      throw new BranchFrozenError();
    }
  }
}
