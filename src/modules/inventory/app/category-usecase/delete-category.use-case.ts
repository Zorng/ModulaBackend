import { Ok, Err, type Result } from "../../../../shared/result.js";
import { InventoryCategoryRepository } from "../../domain/repositories.js";
import { StockItemRepository } from "../../domain/repositories.js";
import type { InventoryCategoryDeletedV1 } from "../../../../shared/events.js";

export interface DeleteCategoryInput {
  categoryId: string;
  tenantId: string;
  userId: string;
  safeMode?: boolean; // If true, set items' category_id to null instead of blocking
}

interface IEventBus {
  publishViaOutbox(
    event: InventoryCategoryDeletedV1,
    client?: any
  ): Promise<void>;
}

interface ITransactionManager {
  withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T>;
}

export class DeleteCategoryUseCase {
  constructor(
    private categoryRepo: InventoryCategoryRepository,
    private stockItemRepo: StockItemRepository,
    private eventBus: IEventBus,
    private txManager: ITransactionManager
  ) {}

  async execute(input: DeleteCategoryInput): Promise<Result<void, string>> {
    const { categoryId, tenantId, userId, safeMode = false } = input;

    // Check if category exists
    const existing = await this.categoryRepo.findById(categoryId);
    if (!existing) {
      return Err("Category not found");
    }

    if (existing.tenantId !== tenantId) {
      return Err("Category not found for this tenant");
    }

    // Check if items are assigned
    const itemCount = await this.categoryRepo.countItemsInCategory(categoryId);

    if (itemCount > 0 && !safeMode) {
      return Err(
        `Cannot delete category: ${itemCount} item(s) are assigned to it. Use safe mode to unassign items first.`
      );
    }

    try {
      await this.txManager.withTransaction(async (client) => {
        // If safe mode, nullify category_id on all items first
        if (safeMode && itemCount > 0) {
          await this.stockItemRepo.nullifyCategoryForItems(categoryId);
        }

        // Delete category
        await this.categoryRepo.delete(categoryId);

        // Publish event via outbox
        const event: InventoryCategoryDeletedV1 = {
          type: "inventory.category_deleted",
          v: 1,
          tenantId,
          categoryId,
          categoryName: existing.name,
          itemsAffected: itemCount,
          safeMode,
          deletedBy: userId,
          deletedAt: new Date().toISOString(),
        };

        await this.eventBus.publishViaOutbox(event, client);
      });

      return Ok(undefined);
    } catch (error: any) {
      return Err(
        error instanceof Error ? error.message : "Failed to delete category"
      );
    }
  }
}
