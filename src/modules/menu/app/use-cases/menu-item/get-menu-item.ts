/**
 * Get Menu Item Use Case
 * Retrieves a single menu item by ID
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";
import type { MenuItem } from "../../../domain/entities.js";
import type { IMenuItemRepository } from "../../../app/ports.js";

export class GetMenuItemUseCase {
  constructor(private menuItemRepo: IMenuItemRepository) {}

  async execute(input: {
    tenantId: string;
    menuItemId: string;
  }): Promise<Result<MenuItem, string>> {
    const { tenantId, menuItemId } = input;

    // 1 - Load menu item
    const item = await this.menuItemRepo.findById(menuItemId, tenantId);
    if (!item) {
      return Err("Menu item not found");
    }

    // 2 - Return menu item
    return Ok(item);
  }
}
