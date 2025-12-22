/**
 * Restore Menu Item Use Case
 * Restores a soft-deleted (inactive) menu item, enforcing tenant limits.
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";
import type { MenuItem } from "../../../domain/entities.js";
import type { MenuItemUpdatedV1 } from "../../../../../shared/events.js";
import type {
  IMenuItemRepository,
  ITenantLimitsRepository,
  IPolicyPort,
  IEventBus,
  ITransactionManager,
} from "../../../app/ports.js";

export class RestoreMenuItemUseCase {
  constructor(
    private menuItemRepo: IMenuItemRepository,
    private limitsRepo: ITenantLimitsRepository,
    private policyPort: IPolicyPort,
    private eventBus: IEventBus,
    private txManager: ITransactionManager
  ) {}

  async execute(input: {
    tenantId: string;
    userId: string;
    menuItemId: string;
  }): Promise<Result<MenuItem, string>> {
    const { tenantId, userId, menuItemId } = input;

    const canUpdate = await this.policyPort.canEditMenuItem(tenantId, userId);
    if (!canUpdate) {
      return Err(
        "Permission denied: You don't have permission to restore menu items"
      );
    }

    const item = await this.menuItemRepo.findById(menuItemId, tenantId);
    if (!item) {
      return Err("Menu item not found");
    }

    if (item.isActive) {
      return Err("Menu item is already active");
    }

    try {
      await this.txManager.withTransaction(async (client) => {
        const limits = await this.limitsRepo.findByTenantId(tenantId, client);
        if (!limits) {
          throw new Error("Tenant limits not found. Please contact support.");
        }

        const currentActiveCount = await this.menuItemRepo.countByTenantId(
          tenantId,
          client
        );

        // ModSpec: restore requires soft limit not exceeded.
        if (currentActiveCount >= limits.maxItemsSoft) {
          throw new Error(
            `Menu item limit reached (${currentActiveCount}/${limits.maxItemsSoft}). Archive items or upgrade your plan.`
          );
        }

        item.activate();
        await this.menuItemRepo.save(item, client);

        const event: MenuItemUpdatedV1 = {
          type: "menu.item_updated",
          v: 1,
          tenantId,
          menuItemId: item.id,
          changes: { isActive: true },
          updatedBy: userId,
          updatedAt: new Date().toISOString(),
        };

        await this.eventBus.publishViaOutbox(event, client);
      });

      return Ok(item);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to restore menu item"
      );
    }
  }
}

