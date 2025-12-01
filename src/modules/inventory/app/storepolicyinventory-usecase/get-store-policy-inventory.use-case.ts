import { Err, Ok, type Result } from "../../../../shared/result.js";
import { StorePolicyInventoryRepository } from "../../domain/repositories.js";
import { StorePolicyInventory } from "../../domain/entities.js";

export class GetStorePolicyInventoryUseCase {
  constructor(private policyRepo: StorePolicyInventoryRepository) {}

  async execute(
    tenantId: string
  ): Promise<Result<StorePolicyInventory | null, string>> {
    try {
      const policy = await this.policyRepo.findByTenant(tenantId);
      return Ok(policy);
    } catch (error) {
      return Ok(null);
    }
  }

  async executeWithDefault(
    tenantId: string,
    defaultUpdatedBy: string
  ): Promise<Result<StorePolicyInventory, string>> {
    try {
      let policy = await this.policyRepo.findByTenant(tenantId);

      if (!policy) {
        // Create default policy if not found
        policy = await this.policyRepo.save({
          tenantId,
          inventorySubtractOnFinalize: true, // Default: enable inventory deduction
          branchOverrides: {},
          excludeMenuItemIds: [],
          updatedBy: defaultUpdatedBy,
        });
      }

      return Ok(policy);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to get store policy"
      );
    }
  }
}
