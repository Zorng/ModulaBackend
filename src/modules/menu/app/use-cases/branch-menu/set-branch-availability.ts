/**
 * Set Branch Availability Use Case
 * Sets whether a menu item is available at a specific branch
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";
import { MenuBranchAvailabilityChangedV1 } from "../../../../../shared/events.js";

// TODO: Import port interfaces
// import type {
//   IBranchMenuRepository,
//   IMenuItemRepository,
//   IPolicyPort,
//   IEventBus
// } from "../../ports.js";

export class SetBranchAvailabilityUseCase {
  constructor() // private branchMenuRepo: IBranchMenuRepository,
  // private menuItemRepo: IMenuItemRepository,
  // private policyPort: IPolicyPort,
  // private eventBus: IEventBus
  {}

  async execute(input: {
    tenantId: string;
    userId: string;
    menuItemId: string;
    branchId: string;
    isAvailable: boolean;
  }): Promise<Result<void, string>> {
    const { tenantId, userId, menuItemId, branchId, isAvailable } = input;

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

    // TODO: Step 3 - Set availability override
    // await this.branchMenuRepo.setAvailability(menuItemId, branchId, tenantId, isAvailable);

    // TODO: Step 4 - Publish MenuBranchAvailabilityChangedV1 event
    // const event = new MenuBranchAvailabilityChangedV1({
    //   menuItemId,
    //   branchId,
    //   tenantId,
    //   isAvailable,
    //   occurredAt: new Date()
    // });
    // await this.eventBus.publish(event);

    // TODO: Step 5 - Return success
    // return Ok(undefined);

    throw new Error(
      "Not implemented - uncomment and complete the TODOs above!"
    );
  }
}
