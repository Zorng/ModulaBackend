import type { TenantRepository } from "../infra/repository.js";
import type {
  Tenant,
  TenantMetadata,
  TenantProfile,
  TenantProfileUpdate,
} from "../domain/entities.js";
import type { AuditWriterPort } from "../../../shared/ports/audit.js";

export class TenantService {
  constructor(
    private repo: TenantRepository,
    private auditWriter: AuditWriterPort
  ) {}

  async getProfile(tenantId: string): Promise<TenantProfile> {
    const tenant = await this.repo.getTenantProfile(tenantId);
    if (!tenant) {
      throw new Error("Tenant not found");
    }
    return tenant;
  }

  async getMetadata(tenantId: string): Promise<TenantMetadata> {
    const metadata = await this.repo.getTenantMetadata(tenantId);
    if (!metadata) {
      throw new Error("Tenant not found");
    }
    return metadata;
  }

  async updateProfile(params: {
    tenantId: string;
    updates: TenantProfileUpdate;
    actorEmployeeId: string;
    actorRole?: string;
  }): Promise<Tenant> {
    const validated = this.validateProfileUpdate(params.updates);

    const updated = await this.repo.updateTenantProfile(
      params.tenantId,
      validated
    );

    await this.auditWriter.write({
      tenantId: params.tenantId,
      employeeId: params.actorEmployeeId,
      actorRole: params.actorRole ?? null,
      actionType: "TENANT_PROFILE_UPDATED",
      resourceType: "TENANT",
      resourceId: params.tenantId,
      details: {
        updates: {
          ...(validated.name !== undefined ? { name: validated.name } : {}),
          ...(validated.contact_phone !== undefined
            ? { contact_phone: validated.contact_phone }
            : {}),
          ...(validated.contact_email !== undefined
            ? { contact_email: validated.contact_email }
            : {}),
          ...(validated.contact_address !== undefined
            ? { contact_address: validated.contact_address }
            : {}),
        },
      },
    });

    return updated;
  }

  async updateLogo(params: {
    tenantId: string;
    logoUrl: string;
    actorEmployeeId: string;
    actorRole?: string;
  }): Promise<Tenant> {
    const trimmed = params.logoUrl.trim();
    if (trimmed.length === 0) {
      throw new Error("logoUrl is required");
    }

    const updated = await this.repo.updateTenantLogo(params.tenantId, trimmed);

    await this.auditWriter.write({
      tenantId: params.tenantId,
      employeeId: params.actorEmployeeId,
      actorRole: params.actorRole ?? null,
      actionType: "TENANT_LOGO_UPDATED",
      resourceType: "TENANT",
      resourceId: params.tenantId,
      details: { logo_url: trimmed },
    });

    return updated;
  }

  private validateProfileUpdate(updates: TenantProfileUpdate): TenantProfileUpdate {
    const validated: TenantProfileUpdate = {};

    if (updates.name !== undefined) {
      if (typeof updates.name !== "string") {
        throw new Error("name must be a string");
      }
      const trimmed = updates.name.trim();
      if (trimmed.length === 0 || trimmed.length > 255) {
        throw new Error("name must be between 1 and 255 characters");
      }
      validated.name = trimmed;
    }

    if (updates.contact_phone !== undefined) {
      if (updates.contact_phone !== null && typeof updates.contact_phone !== "string") {
        throw new Error("contact_phone must be a string or null");
      }
      validated.contact_phone = updates.contact_phone ? updates.contact_phone.trim() : null;
    }

    if (updates.contact_email !== undefined) {
      if (updates.contact_email !== null && typeof updates.contact_email !== "string") {
        throw new Error("contact_email must be a string or null");
      }
      const normalized = updates.contact_email ? updates.contact_email.trim() : null;
      if (normalized && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        throw new Error("contact_email is not a valid email address");
      }
      validated.contact_email = normalized;
    }

    if (updates.contact_address !== undefined) {
      if (updates.contact_address !== null && typeof updates.contact_address !== "string") {
        throw new Error("contact_address must be a string or null");
      }
      validated.contact_address = updates.contact_address
        ? updates.contact_address.trim()
        : null;
    }

    return validated;
  }
}
