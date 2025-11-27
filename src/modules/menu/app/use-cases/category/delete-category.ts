// src/modules/menu/app/use-cases/category/delete-category.ts
/**
 * Delete Category Use Case
 * Soft-deletes a category (deactivates) after validating no menu items exist
 * UPDATED: Now transaction-aware
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";
import type {
  ICategoryRepository,
  IMenuItemRepository,
  IPolicyPort,
  IEventBus,
  ITransactionManager,
} from "../../../app/ports.js";
import type { MenuCategoryDeletedV1 } from "../../../../../shared/events.js";

export class DeleteCategoryUseCase {
  constructor(
    private categoryRepo: ICategoryRepository,
    private menuItemRepo: IMenuItemRepository,
    private policyPort: IPolicyPort,
    private eventBus: IEventBus,
    private txManager: ITransactionManager
  ) {}

  async execute(input: {
    tenantId: string;
    userId: string;
    categoryId: string;
  }): Promise<Result<void, string>> {
    const { tenantId, userId, categoryId } = input;

    // 1 - Check permissions (outside transaction - read-only)
    const canDelete = await this.policyPort.canCreateCategory(tenantId, userId);
    if (!canDelete) {
      return Err(
        "Permission denied: You don't have permission to delete categories"
      );
    }

    try {
      // 2-5 - All database operations in a single transaction
      await this.txManager.withTransaction(async (client) => {
        // 2 - Load category
        const category = await this.categoryRepo.findById(
          categoryId,
          tenantId,
          client
        );
        if (!category) {
          throw new Error("Category not found");
        }

        // 3 - Check if category has active menu items
        const items = await this.menuItemRepo.findByCategoryId(
          categoryId,
          tenantId
        );
        if (items.length > 0) {
          throw new Error(
            `Cannot delete category "${category.name}" because it has ${items.length} menu item(s). ` +
              `Please move or delete the items first.`
          );
        }

        // 4 - Soft delete (deactivate)
        category.deactivate();

        // 5 - Save and publish event
        await this.categoryRepo.save(category, client);

        // Create and publish domain event
        const event: MenuCategoryDeletedV1 = {
          type: "menu.category_deleted",
          v: 1,
          tenantId,
          categoryId: category.id,
          name: category.name,
          deletedBy: userId,
          deletedAt: new Date().toISOString(),
        };

        await this.eventBus.publishViaOutbox(event, client);
      });

      // 6 - Return success
      return Ok(undefined);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to delete category"
      );
    }
  }
}
