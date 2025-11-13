/**
 * Create Category Use Case
 * Creates a new menu category with validation, quota checks, and event publishing
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";
import { Category } from "../../../domain/entities.js";
import { MenuCategoryCreatedV1 } from "../../../../../shared/events.js";

// TODO: Import port interfaces once you create ports.ts
// import type {
//   ICategoryRepository,
//   ITenantLimitsRepository,
//   IPolicyPort,
//   IEventBus,
//   ITransactionManager
// } from "../../ports.js";

export class CreateCategoryUseCase {
  // TODO: Add constructor with dependencies:
  constructor() // private categoryRepo: ICategoryRepository,
  // private limitsRepo: ITenantLimitsRepository,
  // private policyPort: IPolicyPort,
  // private eventBus: IEventBus,
  // private txManager: ITransactionManager
  {}

  async execute(input: {
    tenantId: string;
    userId: string;
    name: string;
    displayOrder: number;
  }): Promise<Result<Category, string>> {
    const { tenantId, userId, name, displayOrder } = input;

    // TODO: Step 1 - Check permissions
    // const canCreate = await this.policyPort.canCreateCategory(tenantId, userId);
    // if (!canCreate) {
    //   return Err("Permission denied: You don't have access to create categories");
    // }

    // TODO: Step 2 - Check quota limits
    // const limits = await this.limitsRepo.findByTenantId(tenantId);
    // if (!limits) {
    //   return Err("Tenant limits not found. Please contact support.");
    // }
    // const currentCount = await this.categoryRepo.countByTenantId(tenantId);
    // const limitCheck = limits.checkCategoryLimit(currentCount);
    // if (limitCheck.status === 'exceeded') {
    //   return Err(limitCheck.message);
    // }
    // // Optional: Log warning if approaching limit
    // if (limitCheck.status === 'warning') {
    //   console.warn(`[CreateCategory] ${limitCheck.message}`);
    // }

    // TODO: Step 3 - Check name uniqueness
    // const nameExists = await this.categoryRepo.existsByName(name, tenantId);
    // if (nameExists) {
    //   return Err(`Category name "${name}" already exists`);
    // }

    // TODO: Step 4 - Create category entity with validation
    // const categoryResult = Category.create({
    //   tenantId,
    //   name,
    //   displayOrder,
    //   isActive: true
    // });
    // if (categoryResult.isErr()) {
    //   return Err(`Validation failed: ${categoryResult.error}`);
    // }
    // const category = categoryResult.value;

    // TODO: Step 5 - Save to database within transaction
    // await this.txManager.withTransaction(async (client) => {
    //   await this.categoryRepo.save(category);
    //
    //   // Step 6 - Publish domain event via outbox for reliability
    //   const event = new MenuCategoryCreatedV1({
    //     categoryId: category.id,
    //     tenantId: category.tenantId,
    //     name: category.name,
    //     displayOrder: category.displayOrder,
    //     occurredAt: new Date()
    //   });
    //   await this.eventBus.publishViaOutbox(event, client);
    // });

    // TODO: Step 7 - Return success result
    // return Ok(category);

    throw new Error(
      "Not implemented - uncomment and complete the TODOs above!"
    );
  }
}
