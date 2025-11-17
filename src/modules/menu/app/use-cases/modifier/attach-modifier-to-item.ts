/**
 * Attach Modifier to Item Use Case
 * Links a modifier group to a menu item (many-to-many relationship)
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";
import type {
  IMenuItemRepository,
  IModifierRepository,
  IMenuItemModifierRepository,
  IPolicyPort,
  IEventBus,
  ITransactionManager,
} from "../../../app/ports.js";

import { MenuModifierAttachedV1 } from "../../../../../shared/events.js";

export class AttachModifierToItemUseCase {
  constructor(
    private menuItemRepo: IMenuItemRepository,
    private modifierRepo: IModifierRepository,
    private itemModifierRepo: IMenuItemModifierRepository,
    private policyPort: IPolicyPort,
    private eventBus: IEventBus,
    private txManager: ITransactionManager
  ) {}

  async execute(input: {
    tenantId: string;
    userId: string;
    menuItemId: string;
    modifierGroupId: string;
    isRequired?: boolean;
  }): Promise<Result<void, string>> {
    const {
      tenantId,
      userId,
      menuItemId,
      modifierGroupId,
      isRequired = false,
    } = input;

    // 1 - Check permissions
    const canManage = await this.policyPort.canManageModifiers(
      tenantId,
      userId
    );
    if (!canManage) {
      return Err(
        "Permission denied: You don't have permission to manage modifiers"
      );
    }

    // 2 - Verify menu item exists
    const item = await this.menuItemRepo.findById(menuItemId, tenantId);
    if (!item) {
      return Err("Menu item not found");
    }

    // 3 - Verify modifier group exists
    const group = await this.modifierRepo.findGroupById(
      modifierGroupId,
      tenantId
    );
    if (!group) {
      return Err("Modifier group not found");
    }

    // 4 - Check if already attached
    const isAttached = await this.itemModifierRepo.isAttached(
      menuItemId,
      modifierGroupId,
      tenantId
    );
    if (isAttached) {
      return Err("This modifier group is already attached to the menu item");
    }

    //5 - Attach modifier to item and publish event
    await this.txManager.withTransaction(async (client) => {
      await this.itemModifierRepo.attach(
        menuItemId,
        modifierGroupId,
        tenantId,
        isRequired
      );

      const event: MenuModifierAttachedV1 = {
        type: "menu.modifier_attached",
        v: 1,
        tenantId,
        menuItemId,
        modifierId: modifierGroupId,
        attachedBy: userId,
        attachedAt: new Date().toISOString(),
      };

      await this.eventBus.publishViaOutbox(event, client);
    });

    // 7 - Return success
    return Ok(undefined);
  }
}
