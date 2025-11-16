/**
 * Update Menu Item Use Case
 * Updates an existing menu item's details (name, price, description, category, image)
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";
import type { MenuItem } from "../../../domain/entities.js";
import type { MenuItemUpdatedV1 } from "../../../../../shared/events.js";
import type {
  IMenuItemRepository,
  ICategoryRepository,
  IImageStoragePort,
  IPolicyPort,
  IEventBus,
  ITransactionManager,
} from "../../ports.js";

export class UpdateMenuItemUseCase {
  constructor(
    private menuItemRepo: IMenuItemRepository,
    private categoryRepo: ICategoryRepository,
    private imageStorage: IImageStoragePort,
    private policyPort: IPolicyPort,
    private eventBus: IEventBus,
    private txManager: ITransactionManager
  ) {}

  async execute(input: {
    tenantId: string;
    userId: string;
    menuItemId: string;
    name?: string;
    description?: string;
    priceUsd?: number;
    categoryId?: string;
    imageUrl?: string;
  }): Promise<Result<MenuItem, string>> {
    const {
      tenantId,
      userId,
      menuItemId,
      name,
      description,
      priceUsd,
      categoryId,
      imageUrl,
    } = input;

    // Validate at least one field is provided
    if (
      name === undefined &&
      description === undefined &&
      priceUsd === undefined &&
      categoryId === undefined &&
      imageUrl === undefined
    ) {
      return Err("At least one field must be provided to update");
    }

    // 1 - Check permissions
    const canUpdate = await this.policyPort.canEditMenuItem(tenantId, userId);
    if (!canUpdate) {
      return Err(
        "Permission denied: You don't have permission to update menu items"
      );
    }

    // 2 - Load existing menu item
    const item = await this.menuItemRepo.findById(menuItemId, tenantId);
    if (!item) {
      return Err("Menu item not found");
    }

    // 3 - Validate new category if provided
    if (categoryId !== undefined) {
      const category = await this.categoryRepo.findById(categoryId, tenantId);
      if (!category) {
        return Err("Category not found");
      }
    }

    // 4 - Validate new image URL if provided
    if (
      imageUrl !== undefined &&
      imageUrl &&
      !this.imageStorage.isValidImageUrl(imageUrl)
    ) {
      return Err("Invalid image URL format. Use .jpg, .jpeg, .webp, or .png");
    }

    // Track what changed for the event
    const changes: {
      name?: string;
      description?: string;
      priceUsd?: number;
      categoryId?: string;
      imageUrl?: string;
    } = {};

    // 5 - Apply updates using entity methods
    if (priceUsd !== undefined) {
      const priceResult = item.updatePrice(priceUsd);
      if (!priceResult.ok) {
        return Err(`Failed to update price: ${priceResult.error}`);
      }
      changes.priceUsd = priceUsd;
    }

    if (
      name !== undefined ||
      description !== undefined ||
      imageUrl !== undefined
    ) {
      const detailsResult = item.updateDetails({
        name,
        description,
        imageUrl,
      });
      if (!detailsResult.ok) {
        return Err(`Failed to update details: ${detailsResult.error}`);
      }
      if (name !== undefined) changes.name = name;
      if (description !== undefined) changes.description = description;
      if (imageUrl !== undefined) changes.imageUrl = imageUrl;
    }

    if (categoryId !== undefined) {
      item.changeCategory(categoryId);
      changes.categoryId = categoryId;
    }

    // 6 - Save and publish event
    await this.txManager.withTransaction(async (client) => {
      await this.menuItemRepo.save(item);

      const event: MenuItemUpdatedV1 = {
        type: "menu.item_updated",
        v: 1,
        menuItemId: item.id,
        tenantId: item.tenantId,
        changes,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      };

      await this.eventBus.publishViaOutbox(event, client);
    });

    // 8 - Return success
    return Ok(item);
  }
}
