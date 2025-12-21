import type { Pool } from "pg";
import type {
  MembershipProvisioningPort,
  PolicyDefaultsPort,
  TenantProvisioningPort,
} from "../../../shared/ports/tenant.js";
import { TenantRepository } from "../infra/repository.js";

export class TenantProvisioningService {
  constructor(
    private pool: Pool,
    private repo: TenantRepository,
    private membershipProvisioning: MembershipProvisioningPort,
    private policyDefaults: PolicyDefaultsPort
  ) {}

  async provisionTenant(params: Parameters<TenantProvisioningPort["provisionTenant"]>[0]) {
    const name =
      typeof params.name === "string" ? params.name.trim() : "";
    if (name.length === 0) {
      throw new Error("name is required");
    }

    const client = await this.pool.connect();
    let tenantIdForCleanup: string | null = null;
    let provisioned:
      | Awaited<ReturnType<TenantProvisioningPort["provisionTenant"]>>
      | null = null;

    try {
      await client.query("BEGIN");

      const tenant = await this.repo.createTenant(
        {
          name,
          business_type: params.business_type ?? null,
          status: "ACTIVE",
        },
        client
      );
      tenantIdForCleanup = tenant.id;

      const branch = await this.repo.createBranch(
        {
          tenant_id: tenant.id,
          name: "Main Branch",
          address: "Primary business location",
        },
        client
      );

      const { employee, role } =
        await this.membershipProvisioning.createInitialAdminMembership({
          client,
          accountId: params.accountId,
          tenantId: tenant.id,
          branchId: branch.id,
          phone: params.phone,
          firstName: params.firstName,
          lastName: params.lastName,
          passwordHash: params.passwordHash,
        });

      await this.repo.writeAuditLog(
        {
          tenantId: tenant.id,
          branchId: branch.id,
          employeeId: employee.id,
          actionType: "TENANT_CREATED",
          resourceType: "TENANT",
          resourceId: tenant.id,
          details: {
            name,
            business_type: params.business_type ?? null,
          },
        },
        client
      );

      await this.repo.writeAuditLog(
        {
          tenantId: tenant.id,
          branchId: branch.id,
          employeeId: employee.id,
          actionType: "BRANCH_CREATED",
          resourceType: "BRANCH",
          resourceId: branch.id,
          details: {
            name: branch.name,
          },
        },
        client
      );

      await client.query("COMMIT");
      provisioned = { tenant, branch, employee, role };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    if (!provisioned) {
      throw new Error("Tenant provisioning failed");
    }

    try {
      await this.policyDefaults.ensureDefaultPolicies(provisioned.tenant.id);
    } catch (err) {
      if (tenantIdForCleanup) {
        try {
          await this.pool.query(`DELETE FROM tenants WHERE id = $1`, [
            tenantIdForCleanup,
          ]);
        } catch (cleanupErr) {
          // eslint-disable-next-line no-console
          console.error(
            "[tenant] Failed to cleanup tenant after policy seeding error:",
            cleanupErr
          );
        }
      }
      throw err;
    }

    return provisioned;
  }
}

export function createTenantProvisioningPort(
  service: TenantProvisioningService
): TenantProvisioningPort {
  return {
    provisionTenant: (params) => service.provisionTenant(params),
  };
}
