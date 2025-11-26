/**
 * List Menu Items Use Case
 * Retrieves all menu items for a tenant
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";
import type { MenuItem } from "../../../domain/entities.js";
import type { IMenuItemRepository } from "../../../app/ports.js";

export class ListMenuItemsUseCase {
  constructor(private menuItemRepo: IMenuItemRepository) {}

  async execute(input: {
    tenantId: string;
  }): Promise<Result<MenuItem[], string>> {
    const { tenantId } = input;

    try {
      // 1 - Find all active menu items for the tenant
      const items = await this.menuItemRepo.findActiveByTenantId(tenantId);

      // 2 - Return items (empty array is valid)
      return Ok(items);
    } catch (error) {
      return Err(
        `Failed to list menu items: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}
