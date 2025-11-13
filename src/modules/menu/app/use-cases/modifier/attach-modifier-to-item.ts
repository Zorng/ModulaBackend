/**
 * Attach Modifier to Item Use Case
 * Links a modifier group to a menu item (many-to-many relationship)
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";
import { MenuModifierAttachedV1 } from "../../../../../shared/events.js";

// TODO: Import port interfaces
// import type {
//   IMenuItemRepository,
//   IModifierRepository,
//   IMenuItemModifierRepository,
//   IPolicyPort,
//   IEventBus
// } from "../../ports.js";

export class AttachModifierToItemUseCase {
  constructor() // private menuItemRepo: IMenuItemRepository,
  // private modifierRepo: IModifierRepository,
  // private itemModifierRepo: IMenuItemModifierRepository,
  // private policyPort: IPolicyPort,
  // private eventBus: IEventBus
  {}

  async execute(input: {
    tenantId: string;
    userId: string;
    menuItemId: string;
    modifierGroupId: string;
    isRequired: boolean;
  }): Promise<Result<void, string>> {
    const { tenantId, userId, menuItemId, modifierGroupId, isRequired } = input;

    // TODO: Step 1 - Check permissions
    // const canManage = await this.policyPort.canManageModifiers(tenantId, userId);
    // if (!canManage) {
    //   return Err("Permission denied");
    // }

    // TODO: Step 2 - Verify menu item exists
    // const item = await this.menuItemRepo.findById(menuItemId, tenantId);
    // if (!item) {
    //   return Err("Menu item not found");
    // }

    // TODO: Step 3 - Verify modifier group exists
    // const group = await this.modifierRepo.findGroupById(modifierGroupId, tenantId);
    // if (!group) {
    //   return Err("Modifier group not found");
    // }

    // TODO: Step 4 - Check if already attached
    // const isAttached = await this.itemModifierRepo.isAttached(menuItemId, modifierGroupId, tenantId);
    // if (isAttached) {
    //   return Err("This modifier group is already attached to the menu item");
    // }

    // TODO: Step 5 - Attach modifier to item
    // await this.itemModifierRepo.attach(menuItemId, modifierGroupId, tenantId, isRequired);

    // TODO: Step 6 - Publish MenuModifierAttachedV1 event
    // const event = new MenuModifierAttachedV1({
    //   menuItemId,
    //   modifierGroupId,
    //   tenantId,
    //   isRequired,
    //   occurredAt: new Date()
    // });
    // await this.eventBus.publish(event);

    // TODO: Step 7 - Return success
    // return Ok(undefined);

    throw new Error(
      "Not implemented - uncomment and complete the TODOs above!"
    );
  }
}
