import { StorePolicyInventoryRepository } from "../../domain/repositories.js";
import { StorePolicyInventory } from "../../domain/entities.js";

export class GetStorePolicyInventoryUseCase {
  constructor(private policyRepo: StorePolicyInventoryRepository) {}

  async execute(tenantId: string): Promise<StorePolicyInventory | null> {
    return this.policyRepo.findByTenant(tenantId);
  }
}
