import type { MembershipProvisioningPort } from "../../../shared/ports/tenant.js";
import { AuthRepository } from "../infra/repository.js";

export function createMembershipProvisioningPort(): MembershipProvisioningPort {
  return {
    createInitialAdminMembership: async (params) => {
      const repo = new AuthRepository(params.client);

      const employee = await repo.createEmployee({
        account_id: params.accountId,
        tenant_id: params.tenantId,
        phone: params.phone,
        email: undefined,
        password_hash: params.passwordHash,
        first_name: params.firstName,
        last_name: params.lastName,
        status: "ACTIVE",
      });

      await repo.createEmployeeBranchAssignment({
        employee_id: employee.id,
        branch_id: params.branchId,
        role: "ADMIN",
        active: true,
      });

      return { employee, role: "ADMIN" };
    },
  };
}

