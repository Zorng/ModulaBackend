// src/modules/menu/app/use-cases/category/create-category.ts
import { Ok, Err, type Result } from "../../../../../shared/result.js";
import { Category } from "../../../domain/entities.js";
import { MenuCategoryCreatedV1 } from "../../../../../shared/events.js";
import type {
  ICategoryRepository,
  ITenantLimitsRepository,
  IPolicyPort,
  IEventBus,
  ITransactionManager,
} from "../../ports.js";

/**
 * Create Category Use Case
 * Creates a new menu category with validation, quota checks, and event publishing
 *
 * Flow:
 * 1. Check permissions (non-transactional)
 * 2. Check quota limits (non-transactional)
 * 3. Check name uniqueness (non-transactional)
 * 4. Create entity with validation
 * 5. Save + Publish event (TRANSACTIONAL - all or nothing)
 */
export class CreateCategoryUseCase {
  constructor(
    private categoryRepo: ICategoryRepository,
    private limitsRepo: ITenantLimitsRepository,
    private policyPort: IPolicyPort,
    private eventBus: IEventBus,
    private txManager: ITransactionManager
  ) {}

  async execute(input: {
    tenantId: string;
    userId: string;
    name: string;
    description: string;
    displayOrder: number;
  }): Promise<Result<Category, string>> {
    const { tenantId, userId, name, description, displayOrder } = input;

    // ========================================
    // 1: Check Permissions (non-transactional)
    // ========================================
    const canCreate = await this.policyPort.canCreateCategory(tenantId, userId);
    if (!canCreate) {
      return Err(
        "Permission denied: You don't have access to create categories"
      );
    }

    // ========================================
    // 2: Check Quota Limits (non-transactional)
    // ========================================
    // TODO: Tenant limits module not complete - bypassing for now
    // const limits = await this.limitsRepo.findByTenantId(tenantId);
    // if (!limits) {
    //   return Err("Tenant limits not found. Please contact support.");
    // }

    // const currentCount = await this.categoryRepo.countByTenantId(tenantId);
    // const limitCheck = limits.checkCategoryLimit(currentCount);

    // if (limitCheck.status === "exceeded") {
    //   return Err(limitCheck.message);
    // }

    // // Log warning if approaching limit
    // if (limitCheck.status === "warning") {
    //   console.warn(`[CreateCategory] ${limitCheck.message}`);
    // }

    // ========================================
    // 3: Check Name Uniqueness (non-transactional)
    // ========================================
    const nameExists = await this.categoryRepo.existsByName(name, tenantId);
    if (nameExists) {
      return Err(`Category name "${name}" already exists`);
    }

    // ========================================
    // 4: Create Entity with Validation
    // ========================================
    const categoryResult = Category.create({
      tenantId,
      name,
      description,
      displayOrder,
      createdBy: userId,
    });

    if (!categoryResult.ok) {
      return Err(`Validation failed: ${categoryResult.error}`);
    }

    const category = categoryResult.value;

    // ========================================
    // 5: Save + Publish Event (TRANSACTIONAL)
    // This is the critical section - all or nothing
    // ========================================
    try {
      await this.txManager.withTransaction(async (client) => {
        // Save category to database (using transaction client)
        await this.categoryRepo.save(category, client);

        // Create domain event
        const event: MenuCategoryCreatedV1 = {
          type: "menu.category_created",
          v: 1,
          categoryId: category.id,
          tenantId: category.tenantId,
          name: category.name,
          displayOrder: category.displayOrder,
          createdBy: category.createdBy,
          createdAt: new Date().toISOString(),
        };

        // Publish event to outbox (using transaction client)
        // If this fails, the entire transaction rolls back
        await this.eventBus.publishViaOutbox(event, client);

        // Transaction commits automatically if we reach here
        console.log(`[CreateCategory] Category created: ${category.id}`);
      });

      // ========================================
      // 6: Return Success
      // ========================================
      return Ok(category);
    } catch (error) {
      // Transaction rolled back - nothing was saved
      console.error("[CreateCategory] Transaction failed:", error);
      return Err(
        `Failed to create category: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}
