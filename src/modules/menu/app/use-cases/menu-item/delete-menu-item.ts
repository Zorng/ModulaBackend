/**
 * Delete Menu Item Use Case
 * Soft-deletes a menu item (deactivates)
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";

// TODO: Import port interfaces
// import type { IMenuItemRepository, IPolicyPort } from "../../ports.js";

export class DeleteMenuItemUseCase {
  constructor() // private menuItemRepo: IMenuItemRepository,
  // private policyPort: IPolicyPort
  {}

  async execute(input: {
    tenantId: string;
    userId: string;
    menuItemId: string;
  }): Promise<Result<void, string>> {
    const { tenantId, userId, menuItemId } = input;

    // TODO: Step 1 - Check permissions
    // const canDelete = await this.policyPort.canEditMenuItem(tenantId, userId);
    // if (!canDelete) {
    //   return Err("Permission denied");
    // }

    // TODO: Step 2 - Load menu item
    // const item = await this.menuItemRepo.findById(menuItemId, tenantId);
    // if (!item) {
    //   return Err("Menu item not found");
    // }

    // TODO: Step 3 - Soft delete (deactivate)
    // const deactivateResult = item.deactivate();
    // if (deactivateResult.isErr()) {
    //   return Err(`Failed to deactivate: ${deactivateResult.error}`);
    // }

    // TODO: Step 4 - Save
    // await this.menuItemRepo.save(item);

    // TODO: Step 5 - Return success
    // return Ok(undefined);

    throw new Error(
      "Not implemented - uncomment and complete the TODOs above!"
    );
  }
}
