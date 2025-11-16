/**
 * Set Branch Price Override Use Case
 * Sets a custom price for a menu item at a specific branch
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";

// Import port interfaces
import type {
  IBranchMenuRepository,
  IMenuItemRepository,
  IPolicyPort
} from "../../ports.js";

export class SetBranchPriceOverrideUseCase {
  constructor(  
    private branchMenuRepo: IBranchMenuRepository,
    private menuItemRepo: IMenuItemRepository,
    private policyPort: IPolicyPort
  ) {}

  async execute(input: {
    tenantId: string;
    userId: string;
    menuItemId: string;
    branchId: string;
    priceUsd: number;
  }): Promise<Result<void, string>> {
    const { tenantId, userId, menuItemId, branchId, priceUsd } = input;

    // 1 - Check permissions
    const canManage = await this.policyPort.canManageBranchMenu(tenantId, userId, branchId);
    if (!canManage) {
      return Err("Permission denied for this branch");
    }

    // 2 - Verify menu item exists
    const item = await this.menuItemRepo.findById(menuItemId, tenantId);
    if (!item) {
      return Err("Menu item not found");
    }

    // 3 - Validate price >= 0
    if (priceUsd < 0) {
      return Err("Price cannot be negative");
    }

    // 4 - Set price override
    await this.branchMenuRepo.setPriceOverride(menuItemId, branchId, tenantId, priceUsd);

    // 5 - Optionally publish event (BranchPriceOverrideSetV1)

    // 6 - Return success
    return Ok(undefined);
  }
}
