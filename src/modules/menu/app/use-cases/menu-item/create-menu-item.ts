/**
 * Create Menu Item Use Case
 * Creates a new menu item with validation, quota checks, and event publishing
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";
import { MenuItem } from "../../../domain/entities.js";
import { MenuItemCreatedV1 } from "../../../../../shared/events.js";

// TODO: Import port interfaces
// import type {
//   IMenuItemRepository,
//   ICategoryRepository,
//   ITenantLimitsRepository,
//   IImageStoragePort,
//   IPolicyPort,
//   IEventBus,
//   ITransactionManager
// } from "../../ports.js";

export class CreateMenuItemUseCase {
  constructor() // private menuItemRepo: IMenuItemRepository,
  // private categoryRepo: ICategoryRepository,
  // private limitsRepo: ITenantLimitsRepository,
  // private imageStorage: IImageStoragePort,
  // private policyPort: IPolicyPort,
  // private eventBus: IEventBus,
  // private txManager: ITransactionManager
  {}

  async execute(input: {
    tenantId: string;
    userId: string;
    categoryId: string;
    name: string;
    description: string;
    priceUsd: number;
    imageUrl?: string;
  }): Promise<Result<MenuItem, string>> {
    const {
      tenantId,
      userId,
      categoryId,
      name,
      description,
      priceUsd,
      imageUrl,
    } = input;

    // TODO: Step 1 - Check permissions
    // const canCreate = await this.policyPort.canEditMenuItem(tenantId, userId);
    // if (!canCreate) {
    //   return Err("Permission denied");
    // }

    // TODO: Step 2 - Verify category exists
    // const category = await this.categoryRepo.findById(categoryId, tenantId);
    // if (!category) {
    //   return Err("Category not found");
    // }

    // TODO: Step 3 - Check quota limits
    // const limits = await this.limitsRepo.findByTenantId(tenantId);
    // if (!limits) {
    //   return Err("Tenant limits not found");
    // }
    // const currentCount = await this.menuItemRepo.countByTenantId(tenantId);
    // const limitCheck = limits.checkItemLimit(currentCount);
    // if (limitCheck.status === 'exceeded') {
    //   return Err(limitCheck.message);
    // }
    // if (limitCheck.status === 'warning') {
    //   console.warn(`[CreateMenuItem] ${limitCheck.message}`);
    // }

    // TODO: Step 4 - Validate image URL if provided
    // if (imageUrl && !this.imageStorage.isValidImageUrl(imageUrl)) {
    //   return Err("Invalid image URL format");
    // }

    // TODO: Step 5 - Check name uniqueness in category
    // const nameExists = await this.menuItemRepo.existsByNameInCategory(name, categoryId, tenantId);
    // if (nameExists) {
    //   return Err(`Menu item "${name}" already exists in this category`);
    // }

    // TODO: Step 6 - Create menu item entity
    // const itemResult = MenuItem.create({
    //   tenantId,
    //   categoryId,
    //   name,
    //   description,
    //   priceUsd,
    //   imageUrl,
    //   isActive: true
    // });
    // if (itemResult.isErr()) {
    //   return Err(`Validation failed: ${itemResult.error}`);
    // }
    // const menuItem = itemResult.value;

    // TODO: Step 7 - Save within transaction + publish event
    // await this.txManager.withTransaction(async (client) => {
    //   await this.menuItemRepo.save(menuItem);
    //
    //   const event = new MenuItemCreatedV1({
    //     menuItemId: menuItem.id,
    //     tenantId: menuItem.tenantId,
    //     categoryId: menuItem.categoryId,
    //     name: menuItem.name,
    //     priceUsd: menuItem.priceUsd,
    //     occurredAt: new Date()
    //   });
    //   await this.eventBus.publishViaOutbox(event, client);
    // });

    // TODO: Step 8 - Return success
    // return Ok(menuItem);

    throw new Error(
      "Not implemented - uncomment and complete the TODOs above!"
    );
  }
}
