import { Ok, Err, type Result } from "../../../../../shared/result.js";
import { MenuItem } from "../../../domain/entities.js";
import type { MenuItemCreatedV1 } from "../../../../../shared/events.js";
import type {
  IMenuItemRepository,
  ICategoryRepository,
  ITenantLimitsRepository,
  IImageStoragePort,
  IPolicyPort,
  IEventBus,
  ITransactionManager,
} from "../../../app/ports.js";

export class CreateMenuItemUseCase {
  constructor(
    private menuItemRepo: IMenuItemRepository,
    private categoryRepo: ICategoryRepository,
    private limitsRepo: ITenantLimitsRepository,
    private imageStorage: IImageStoragePort,
    private policyPort: IPolicyPort,
    private eventBus: IEventBus,
    private txManager: ITransactionManager
  ) {}

  async execute(input: {
    tenantId: string;
    userId: string;
    categoryId: string;
    name: string;
    description?: string;
    priceUsd: number;
    imageUrl?: string; // If caller provides a URL directly
    imageFile?: Buffer; // If caller provides an image file to upload
    imageFilename?: string; // Original filename for upload
  }): Promise<Result<MenuItem, string>> {
    const {
      tenantId,
      userId,
      categoryId,
      name,
      description,
      priceUsd,
      imageUrl: inputImageUrl,
      imageFile,
      imageFilename,
    } = input;

    // 1 - Check permissions (outside transaction)
    const canCreate = await this.policyPort.canEditMenuItem(tenantId, userId);
    if (!canCreate) {
      return Err(
        "Permission denied: You don't have permission to create menu items"
      );
    }

    let finalImageUrl: string | undefined = inputImageUrl;

    // 2 - If image file is provided, upload it and get URL
    if (imageFile && imageFilename) {
      try {
        finalImageUrl = await this.imageStorage.uploadImage(
          imageFile,
          imageFilename,
          tenantId
        );
      } catch (err) {
        return Err(
          err instanceof Error ? err.message : "Failed to upload image"
        );
      }
    }

    // 3 - Validate image URL if provided (outside transaction)
    if (finalImageUrl && !this.imageStorage.isValidImageUrl(finalImageUrl)) {
      return Err("Invalid image URL format. Use .jpg, .jpeg, .webp, or .png");
    }

    // 4 - Create menu item entity (outside transaction - no DB access)
    const itemResult = MenuItem.create({
      tenantId,
      categoryId,
      name,
      description,
      priceUsd,
      imageUrl: finalImageUrl,
      createdBy: userId,
    });

    if (!itemResult.ok) {
      return Err(`Validation failed: ${itemResult.error}`);
    }

    const menuItem = itemResult.value;

    try {
      // 5, 6, 7, 8 - All database operations in transaction
      await this.txManager.withTransaction(async (client) => {
        // 5 - Verify category exists
        const category = await this.categoryRepo.findById(
          categoryId,
          tenantId,
          client
        );
        if (!category) {
          throw new Error("Category not found");
        }

        // 6 - Check quota limits
        const limits = await this.limitsRepo.findByTenantId(tenantId, client);
        if (!limits) {
          throw new Error("Tenant limits not found");
        }

        const currentCount = await this.menuItemRepo.countByTenantId(
          tenantId,
          client
        );
        const limitCheck = limits.checkItemLimit(currentCount);

        if (limitCheck.status === "exceeded") {
          throw new Error(limitCheck.message);
        }

        if (limitCheck.status === "warning") {
          console.warn(`[CreateMenuItem] ${limitCheck.message}`);
        }

        // 7 - Check name uniqueness in category
        const nameExists = await this.menuItemRepo.existsByNameInCategory(
          name,
          categoryId,
          tenantId,
          undefined,
          client
        );
        if (nameExists) {
          throw new Error(
            `Menu item "${name}" already exists in this category`
          );
        }

        // 8 - Save and publish event
        await this.menuItemRepo.save(menuItem, client);

        const event: MenuItemCreatedV1 = {
          type: "menu.item_created",
          v: 1,
          menuItemId: menuItem.id,
          tenantId: menuItem.tenantId,
          categoryId: menuItem.categoryId,
          name: menuItem.name,
          priceUsd: menuItem.priceUsd,
          isActive: menuItem.isActive,
          createdBy: userId,
          createdAt: new Date().toISOString(),
        };

        await this.eventBus.publishViaOutbox(event, client);
      });

      // 9 - Return success
      return Ok(menuItem);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to create menu item"
      );
    }
  }
}
