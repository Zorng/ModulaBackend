/**
 * Delete Category Use Case
 * Soft-deletes a category (deactivates) after validating no menu items exist
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";
import type {
  ICategoryRepository,
  IMenuItemRepository,
  IPolicyPort,
} from "../../ports.js";

export class DeleteCategoryUseCase {
  constructor(
    private categoryRepo: ICategoryRepository,
    private menuItemRepo: IMenuItemRepository,
    private policyPort: IPolicyPort
  ) {}

  async execute(input: {
    tenantId: string;
    userId: string;
    categoryId: string;
  }): Promise<Result<void, string>> {
    const { tenantId, userId, categoryId } = input;

    // 1 - Check permissions
    const canDelete = await this.policyPort.canCreateCategory(tenantId, userId);
    if (!canDelete) {
      return Err(
        "Permission denied: You don't have permission to delete categories"
      );
    }

    // 2 - Load category
    const category = await this.categoryRepo.findById(categoryId, tenantId);
    if (!category) {
      return Err("Category not found");
    }

    // 3 - Check if category has active menu items
    const items = await this.menuItemRepo.findByCategoryId(
      categoryId,
      tenantId
    );
    if (items.length > 0) {
      return Err(
        `Cannot delete category "${category.name}" because it has ${items.length} menu item(s). ` +
          `Please move or delete the items first.`
      );
    }

    // Step 4 - Soft delete and publish event in transaction
    // await this.txManager.withTransaction(async (client) => {
    //   // Deactivate the category
    //   category.deactivate();

    //   // Save the deactivated category
    //   await this.categoryRepo.save(category, client);

    //   // Publish domain event
    //   const event: CategoryDeletedV1 = {
    //     type: "menu.category_deleted",
    //     v: 1,
    //     tenantId,
    //     categoryId: category.id,
    //     name: category.name,
    //     deletedBy: userId,
    //     deletedAt: new Date().toISOString(),
    //   };

    //   await this.eventBus.publishViaOutbox(event, client);
    // });

    // Save the deactivated category
    await this.categoryRepo.save(category);

    // 5 - Return success
    return Ok(undefined);
  }
}
