import { Ok, Err, type Result } from "../../../../shared/result.js";
import { InventoryCategoryRepository } from "../../domain/repositories.js";
import { InventoryCategory } from "../../domain/entities.js";
import type {
  InventoryCategoryUpdatedV1,
  InventoryCategoryDeactivatedV1,
} from "../../../../shared/events.js";

export interface UpdateCategoryInput {
  categoryId: string;
  tenantId: string;
  name?: string;
  displayOrder?: number;
  isActive?: boolean;
  userId: string;
}

interface IEventBus {
  publishViaOutbox(
    event: InventoryCategoryUpdatedV1 | InventoryCategoryDeactivatedV1,
    client?: any
  ): Promise<void>;
}

interface ITransactionManager {
  withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T>;
}

export class UpdateCategoryUseCase {
  constructor(
    private categoryRepo: InventoryCategoryRepository,
    private eventBus: IEventBus,
    private txManager: ITransactionManager
  ) {}

  async execute(
    input: UpdateCategoryInput
  ): Promise<Result<InventoryCategory, string>> {
    const { categoryId, tenantId, name, displayOrder, isActive, userId } =
      input;

    // Check if category exists
    const existing = await this.categoryRepo.findById(categoryId);
    if (!existing) {
      return Err("Category not found");
    }

    if (existing.tenantId !== tenantId) {
      return Err("Category not found for this tenant");
    }

    // Validation
    if (
      name !== undefined &&
      (name.trim().length < 2 || name.trim().length > 40)
    ) {
      return Err("Category name must be between 2 and 40 characters");
    }

    const updates: any = {};
    if (name !== undefined) updates.name = name.trim();
    if (displayOrder !== undefined) updates.displayOrder = displayOrder;
    if (isActive !== undefined) updates.isActive = isActive;

    if (Object.keys(updates).length === 0) {
      return Ok(existing);
    }

    try {
      let updated: InventoryCategory;

      await this.txManager.withTransaction(async (client) => {
        const result = await this.categoryRepo.update(categoryId, updates);
        if (!result) {
          throw new Error("Category not found");
        }
        updated = result;

        // Determine if this is a deactivation
        const isDeactivation = isActive === false && existing.isActive === true;

        // Publish event via outbox
        const event:
          | InventoryCategoryUpdatedV1
          | InventoryCategoryDeactivatedV1 = isDeactivation
          ? {
              type: "inventory.category_deactivated",
              v: 1,
              tenantId,
              categoryId,
              categoryName: existing.name,
              deactivatedBy: userId,
              deactivatedAt: new Date().toISOString(),
            }
          : {
              type: "inventory.category_updated",
              v: 1,
              tenantId,
              categoryId,
              changes: updates,
              updatedBy: userId,
              updatedAt: updated.updatedAt.toISOString(),
            };

        await this.eventBus.publishViaOutbox(event, client);
      });

      return Ok(updated!);
    } catch (error: any) {
      if (error.code === "23505") {
        return Err(
          `Category with name "${name}" already exists for this tenant`
        );
      }
      return Err(
        error instanceof Error ? error.message : "Failed to update category"
      );
    }
  }
}
