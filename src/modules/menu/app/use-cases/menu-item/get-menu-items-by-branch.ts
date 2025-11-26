/**
 * Get Menu Items By Branch Use Case
 * Retrieves all available menu items for a specific branch
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";
import type { MenuItem } from "../../../domain/entities.js";
import type { IBranchMenuRepository } from "../../../app/ports.js";

export class GetMenuItemsByBranchUseCase {
  constructor(private branchMenuRepo: IBranchMenuRepository) {}

  async execute(input: {
    tenantId: string;
    branchId: string;
  }): Promise<Result<MenuItem[], string>> {
    const { tenantId, branchId } = input;

    try {
      const items = await this.branchMenuRepo.findAvailableByBranchId(
        branchId,
        tenantId
      );
      if (!items || items.length === 0) {
        return Err("No available menu items found for this branch");
      }
      return Ok(items);
    } catch (error) {
      return Err(
        error instanceof Error
          ? error.message
          : "Failed to get menu items by branch"
      );
    }
  }
}
