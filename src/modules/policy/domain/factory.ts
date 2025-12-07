import { PgPolicyRepository } from "../infra/repository.js";
import type { IPolicyRepository } from "../infra/repository.js";
import { pool } from "../../../platform/db/index.js";
import {
  GetTenantPoliciesUseCase,
  GetSalesPoliciesUseCase,
  GetInventoryPoliciesUseCase,
  GetCashSessionPoliciesUseCase,
  GetAttendancePoliciesUseCase,
  UpdateTenantPoliciesUseCase,
} from "../app/use-cases.js";

/**
 * Factory for creating policy use case instances
 */
export class PolicyFactory {
  static build() {
    const policyRepository: IPolicyRepository = new PgPolicyRepository(pool);

    return {
      getTenantPoliciesUseCase: new GetTenantPoliciesUseCase(policyRepository),
      getSalesPoliciesUseCase: new GetSalesPoliciesUseCase(policyRepository),
      getInventoryPoliciesUseCase: new GetInventoryPoliciesUseCase(
        policyRepository
      ),
      getCashSessionPoliciesUseCase: new GetCashSessionPoliciesUseCase(
        policyRepository
      ),
      getAttendancePoliciesUseCase: new GetAttendancePoliciesUseCase(
        policyRepository
      ),
      updateTenantPoliciesUseCase: new UpdateTenantPoliciesUseCase(
        policyRepository
      ),
    };
  }
}
