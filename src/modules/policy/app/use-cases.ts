import type { IPolicyRepository } from "../infra/repository.js";
import type {
  TenantPolicies,
  SalesPolicies,
  InventoryPolicies,
  CashSessionPolicies,
  AttendancePolicies,
  UpdateTenantPoliciesInput,
} from "../domain/entities.js";
import { Ok, Err, type Result } from "../../../shared/result.js";

// Helper aliases for cleaner code
const ok = Ok;
const err = Err;

/**
 * Get all tenant policies (combined view)
 */
export class GetTenantPoliciesUseCase {
  constructor(private policyRepository: IPolicyRepository) {}

  async execute(params: {
    tenantId: string;
    branchId: string;
  }): Promise<Result<TenantPolicies, string>> {
    const policies = await this.policyRepository.getTenantPolicies(
      params.tenantId,
      params.branchId
    );

    if (!policies) {
      // Ensure default policies exist
      const defaultPolicies = await this.policyRepository.ensureDefaultPolicies(
        params.tenantId,
        params.branchId
      );
      return ok(defaultPolicies);
    }

    return ok(policies);
  }
}

/**
 * Get sales policies (Tax & Currency)
 */
export class GetSalesPoliciesUseCase {
  constructor(private policyRepository: IPolicyRepository) {}

  async execute(params: {
    tenantId: string;
    branchId: string;
  }): Promise<Result<SalesPolicies, string>> {
    let policies = await this.policyRepository.getSalesPolicies(
      params.tenantId,
      params.branchId
    );

    if (!policies) {
      // Ensure defaults exist
      await this.policyRepository.ensureDefaultPolicies(
        params.tenantId,
        params.branchId
      );
      policies = await this.policyRepository.getSalesPolicies(
        params.tenantId,
        params.branchId
      );
    }

    if (!policies) {
      return err("Sales policies not found");
    }

    return ok(policies);
  }
}

/**
 * Get inventory policies
 */
export class GetInventoryPoliciesUseCase {
  constructor(private policyRepository: IPolicyRepository) {}

  async execute(params: {
    tenantId: string;
    branchId: string;
  }): Promise<Result<InventoryPolicies, string>> {
    let policies = await this.policyRepository.getInventoryPolicies(
      params.tenantId,
      params.branchId
    );

    if (!policies) {
      // Ensure defaults exist
      await this.policyRepository.ensureDefaultPolicies(
        params.tenantId,
        params.branchId
      );
      policies = await this.policyRepository.getInventoryPolicies(
        params.tenantId,
        params.branchId
      );
    }

    if (!policies) {
      return err("Inventory policies not found");
    }

    return ok(policies);
  }
}

/**
 * Get cash session policies
 */
export class GetCashSessionPoliciesUseCase {
  constructor(private policyRepository: IPolicyRepository) {}

  async execute(params: {
    tenantId: string;
    branchId: string;
  }): Promise<Result<CashSessionPolicies, string>> {
    let policies = await this.policyRepository.getCashSessionPolicies(
      params.tenantId,
      params.branchId
    );

    if (!policies) {
      // Ensure defaults exist
      await this.policyRepository.ensureDefaultPolicies(
        params.tenantId,
        params.branchId
      );
      policies = await this.policyRepository.getCashSessionPolicies(
        params.tenantId,
        params.branchId
      );
    }

    if (!policies) {
      return err("Cash session policies not found");
    }

    return ok(policies);
  }
}

/**
 * Get attendance policies
 */
export class GetAttendancePoliciesUseCase {
  constructor(private policyRepository: IPolicyRepository) {}

  async execute(params: {
    tenantId: string;
    branchId: string;
  }): Promise<Result<AttendancePolicies, string>> {
    let policies = await this.policyRepository.getAttendancePolicies(
      params.tenantId,
      params.branchId
    );

    if (!policies) {
      // Ensure defaults exist
      await this.policyRepository.ensureDefaultPolicies(
        params.tenantId,
        params.branchId
      );
      policies = await this.policyRepository.getAttendancePolicies(
        params.tenantId,
        params.branchId
      );
    }

    if (!policies) {
      return err("Attendance policies not found");
    }

    return ok(policies);
  }
}

/**
 * Update tenant policies (partial update)
 */
export class UpdateTenantPoliciesUseCase {
  constructor(private policyRepository: IPolicyRepository) {}

  async execute(
    tenantId: string,
    branchId: string,
    updates: UpdateTenantPoliciesInput
  ): Promise<Result<TenantPolicies, string>> {
    // Ensure policies exist first
    const existing = await this.policyRepository.getTenantPolicies(
      tenantId,
      branchId
    );
    if (!existing) {
      await this.policyRepository.ensureDefaultPolicies(tenantId, branchId);
    }

    // Update policies
    const updatedPolicies = await this.policyRepository.updateTenantPolicies(
      tenantId,
      branchId,
      updates
    );

    return ok(updatedPolicies);
  }
}
