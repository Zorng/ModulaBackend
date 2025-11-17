/**
 * Set Branch Availability Use Case
 * Sets whether a menu item is available at a specific branch
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";
import { MenuBranchAvailabilityChangedV1 } from "../../../../../shared/events.js";

// TODO: Import port interfaces
import type {
  IBranchMenuRepository,
  IMenuItemRepository,
  IPolicyPort,
  IEventBus,
} from "../../../app/ports.js";

export class SetBranchAvailabilityUseCase {
  constructor(
    private branchMenuRepo: IBranchMenuRepository,
    private menuItemRepo: IMenuItemRepository,
    private policyPort: IPolicyPort,
    private eventBus: IEventBus
  ) {}

  async execute(input: {
    tenantId: string;
    userId: string;
    menuItemId: string;
    branchId: string;
    isAvailable: boolean;
  }): Promise<Result<void, string>> {
    const { tenantId, userId, menuItemId, branchId, isAvailable } = input;

    // 1 - Check permissions
    const canManage = await this.policyPort.canManageBranchMenu(
      tenantId,
      userId,
      branchId
    );
    if (!canManage) {
      return Err("Permission denied for this branch");
    }

    // 2 - Verify menu item exists
    const item = await this.menuItemRepo.findById(menuItemId, tenantId);
    if (!item) {
      return Err("Menu item not found");
    }

    // 3 - Set availability override
    await this.branchMenuRepo.setAvailability(
      menuItemId,
      branchId,
      tenantId,
      isAvailable
    );

    // 4 - Save and publish event in transaction
    // await this.txManager.withTransaction(async (client) => {
    //   await this.branchMenuRepo.save(branchMenuItem, client);

    //   // Create event as object literal
    //   const event: MenuBranchAvailabilityChangedV1 = {
    //     type: "menu.branch_availability_changed",
    //     v: 1,
    //     tenantId,
    //     branchId,
    //     menuItemId,
    //     isAvailable,
    //     changedBy: userId,
    //     occurredAt: new Date().toISOString(),
    //   };

    //   await this.eventBus.publishViaOutbox(event, client);
    // });

    // 5 - Return success
    return Ok(undefined);

    throw new Error(
      "Not implemented - uncomment and complete the TODOs above!"
    );
  }
}
