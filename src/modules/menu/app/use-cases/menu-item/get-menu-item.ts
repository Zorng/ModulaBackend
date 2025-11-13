/**
 * Get Menu Item Use Case
 * Retrieves a single menu item by ID
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";
import { MenuItem } from "../../../domain/entities.js";

// TODO: Import port interfaces
// import type { IMenuItemRepository } from "../../ports.js";

export class GetMenuItemUseCase {
  constructor() // private menuItemRepo: IMenuItemRepository
  {}

  async execute(input: {
    tenantId: string;
    menuItemId: string;
  }): Promise<Result<MenuItem, string>> {
    const { tenantId, menuItemId } = input;

    // TODO: Step 1 - Load menu item
    // const item = await this.menuItemRepo.findById(menuItemId, tenantId);
    // if (!item) {
    //   return Err("Menu item not found");
    // }

    // TODO: Step 2 - Return menu item
    // return Ok(item);

    throw new Error(
      "Not implemented - uncomment and complete the TODOs above!"
    );
  }
}
