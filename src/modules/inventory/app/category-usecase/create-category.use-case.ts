import { Ok, Err, type Result } from "../../../../shared/result.js";
import { InventoryCategoryRepository } from "../../domain/repositories.js";
import { InventoryCategory } from "../../domain/entities.js";
import type { InventoryCategoryCreatedV1 } from "../../../../shared/events.js";
import type { AuditWriterPort } from "../../../../shared/ports/audit.js";

export interface CreateCategoryInput {
  tenantId: string;
  name: string;
  displayOrder?: number;
  isActive?: boolean;
  userId: string;
  actorRole?: string | null;
}

interface IEventBus {
  publishViaOutbox(
    event: InventoryCategoryCreatedV1,
    client?: any
  ): Promise<void>;
}

interface ITransactionManager {
  withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T>;
}

export class CreateCategoryUseCase {
  constructor(
    private categoryRepo: InventoryCategoryRepository,
    private eventBus: IEventBus,
    private txManager: ITransactionManager,
    private auditWriter: AuditWriterPort
  ) {}

  async execute(
    input: CreateCategoryInput
  ): Promise<Result<InventoryCategory, string>> {
    const { tenantId, name, displayOrder = 0, isActive = true, userId } = input;

    // Validation
    if (!name || name.trim().length < 2 || name.trim().length > 40) {
      return Err("Category name must be between 2 and 40 characters");
    }

    try {
      let category: InventoryCategory;

      await this.txManager.withTransaction(async (client) => {
        // Save category
        category = await this.categoryRepo.save({
          tenantId,
          name: name.trim(),
          displayOrder,
          isActive,
          createdBy: userId,
        });

        await this.auditWriter.write(
          {
            tenantId,
            employeeId: userId,
            actorRole: input.actorRole ?? null,
            actionType: "STOCK_CATEGORY_CREATED",
            resourceType: "stock_category",
            resourceId: category.id,
            details: {
              name: category.name,
              displayOrder: category.displayOrder,
              isActive: category.isActive,
            },
          },
          client
        );

        // Publish event via outbox
        const event: InventoryCategoryCreatedV1 = {
          type: "inventory.category_created",
          v: 1,
          tenantId,
          categoryId: category.id,
          name: category.name,
          displayOrder: category.displayOrder,
          isActive: category.isActive,
          createdBy: userId,
          createdAt: category.createdAt.toISOString(),
        };

        await this.eventBus.publishViaOutbox(event, client);
      });

      return Ok(category!);
    } catch (error: any) {
      if (error.code === "23505") {
        return Err(
          `Category with name "${name}" already exists for this tenant`
        );
      }
      return Err(
        error instanceof Error ? error.message : "Failed to create category"
      );
    }
  }
}
