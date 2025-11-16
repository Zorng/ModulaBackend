/**
 * Update Category Use Case
 * Updates an existing category's name and/or display order
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";
import type { Category } from "../../../domain/entities.js";
import type {
  ICategoryRepository,
  IPolicyPort,
  IEventBus,
  ITransactionManager,
} from "../../ports.js";
import type { CategoryUpdatedV1 } from "../../../../../shared/events.js";

export class UpdateCategoryUseCase {
  constructor(
    private categoryRepo: ICategoryRepository,
    private policyPort: IPolicyPort,
    private eventBus: IEventBus,
    private txManager: ITransactionManager
  ) {}

  async execute(input: {
    tenantId: string;
    userId: string;
    categoryId: string;
    name?: string;
    displayOrder?: number;
  }): Promise<Result<Category, string>> {
    const { tenantId, userId, categoryId, name, displayOrder } = input;

    // Validate at least one field is provided
    if (name === undefined && displayOrder === undefined) {
      return Err("At least one field (name or displayOrder) must be provided");
    }

    // Step 1 - Check permissions
    const canUpdate = await this.policyPort.canCreateCategory(tenantId, userId);
    if (!canUpdate) {
      return Err(
        "Permission denied: You don't have permission to update categories"
      );
    }

    // Step 2 - Load existing category
    const category = await this.categoryRepo.findById(categoryId, tenantId);
    if (!category) {
      return Err("Category not found");
    }

    // Track what changed for the event
    const changes: { name?: string; displayOrder?: number } = {};

    // Step 3 - Apply updates using entity methods
    // If name is provided, rename the category
    if (name !== undefined) {
      const renameResult = category.rename(name);
      if (!renameResult.ok) {
        return Err(`Failed to rename: ${renameResult.error}`);
      }
      changes.name = name;
    }

    // If displayOrder is provided, reorder the category
    if (displayOrder !== undefined) {
      const reorderResult = category.reorder(displayOrder);
      if (!reorderResult.ok) {
        return Err(`Failed to reorder: ${reorderResult.error}`);
      }
      changes.displayOrder = displayOrder;
    }

    // Step 4 & 5 - Save and publish event in transaction
    await this.txManager.withTransaction(async (client) => {
      // Save updated category
      await this.categoryRepo.save(category);

      // Publish CategoryUpdatedV1 event
      const event: CategoryUpdatedV1 = {
        type: "menu.category_updated",
        v: 1,
        tenantId,
        categoryId: category.id,
        changes,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      };

      await this.eventBus.publishViaOutbox(event, client);
    });

    // Step 6 - Return success
    return Ok(category);
  }
}
