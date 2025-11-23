/**
 * Delete Menu Item Use Case
 * Soft-deletes a menu item (deactivates)
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";
import type {
  IMenuItemRepository,
  IPolicyPort,
  IEventBus,
  ITransactionManager,
} from "../../../app/ports.js";
import type { MenuItemDeletedV1 } from "../../../../../shared/events.js";

export class DeleteMenuItemUseCase {
  constructor(
    private menuItemRepo: IMenuItemRepository,
    private policyPort: IPolicyPort,
    private eventBus: IEventBus,
    private txManager: ITransactionManager
  ) {}

  async execute(input: {
    tenantId: string;
    userId: string;
    menuItemId: string;
  }): Promise<Result<void, string>> {
    const { tenantId, userId, menuItemId } = input;

    // 1 - Check permissions
    const canDelete = await this.policyPort.canEditMenuItem(tenantId, userId);
    if (!canDelete) {
      return Err(
        "Permission denied: You don't have permission to delete menu items"
      );
    }

    // 2 - Load menu item
    const item = await this.menuItemRepo.findById(menuItemId, tenantId);
    if (!item) {
      return Err("Menu item not found");
    }

    // 3 - Soft delete (deactivate)
    item.deactivate();

    // 4 - Save and publish event
    await this.txManager.withTransaction(async (client) => {
      await this.menuItemRepo.save(item, client);

      const event: MenuItemDeletedV1 = {
        type: "menu.item_deleted",
        v: 1,
        tenantId,
        branchId: item.branchId,
        menuItemId: item.id,
        categoryId: item.categoryId,
        name: item.name,
        deletedBy: userId,
        deletedAt: new Date().toISOString(),
      };

      await this.eventBus.publishViaOutbox(event, client);
    });

    // 5 - Return success
    return Ok(undefined);
  }
}
