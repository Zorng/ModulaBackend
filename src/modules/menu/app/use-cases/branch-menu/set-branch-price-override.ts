/**
 * Set Branch Price Override Use Case
 * Sets a custom price for a menu item at a specific branch
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";

// TODO: Import port interfaces
// import type {
//   IBranchMenuRepository,
//   IMenuItemRepository,
//   IPolicyPort
// } from "../../ports.js";

export class SetBranchPriceOverrideUseCase {
  constructor() // private branchMenuRepo: IBranchMenuRepository,
  // private menuItemRepo: IMenuItemRepository,
  // private policyPort: IPolicyPort
  {}

  async execute(input: {
    tenantId: string;
    userId: string;
    menuItemId: string;
    branchId: string;
    priceUsd: number;
  }): Promise<Result<void, string>> {
    const { tenantId, userId, menuItemId, branchId, priceUsd } = input;

    // TODO: Step 1 - Check permissions
    // const canManage = await this.policyPort.canManageBranchMenu(tenantId, userId, branchId);
    // if (!canManage) {
    //   return Err("Permission denied for this branch");
    // }

    // TODO: Step 2 - Verify menu item exists
    // const item = await this.menuItemRepo.findById(menuItemId, tenantId);
    // if (!item) {
    //   return Err("Menu item not found");
    // }

    // TODO: Step 3 - Validate price >= 0
    // if (priceUsd < 0) {
    //   return Err("Price cannot be negative");
    // }

    // TODO: Step 4 - Set price override
    // await this.branchMenuRepo.setPriceOverride(menuItemId, branchId, tenantId, priceUsd);

    // TODO: Step 5 - Optionally publish event (BranchPriceOverrideSetV1)

    // TODO: Step 6 - Return success
    // return Ok(undefined);

    throw new Error(
      "Not implemented - uncomment and complete the TODOs above!"
    );
  }
}
