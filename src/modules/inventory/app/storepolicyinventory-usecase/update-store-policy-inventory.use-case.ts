import { StorePolicyInventoryRepository } from "../../domain/repositories.js";
import { StorePolicyInventory } from "../../domain/entities.js";

export interface UpdateStorePolicyInventoryInput {
  inventory_subtract_on_finalize?: boolean;
  branch_overrides?: Record<string, boolean>;
  exclude_menu_item_ids?: string[];
}

export class UpdateStorePolicyInventoryUseCase {
  constructor(private policyRepo: StorePolicyInventoryRepository) {}

  async execute(
    tenantId: string,
    input: UpdateStorePolicyInventoryInput
  ): Promise<StorePolicyInventory | null> {
    return this.policyRepo.update(tenantId, input);
  }
}
