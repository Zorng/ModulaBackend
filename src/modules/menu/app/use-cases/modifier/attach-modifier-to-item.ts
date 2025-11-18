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

    // 1 - Check permissions (outside transaction)
    const canManage = await this.policyPort.canManageModifiers(
      tenantId,
      userId
    );
    if (!canManage) {
      return Err(
        "Permission denied: You don't have permission to manage modifiers"
      );
    }

    try {
      // 2-5 - All checks and writes in transaction
      await this.txManager.withTransaction(async (client) => {
        // 2 - Verify menu item exists
        const item = await this.menuItemRepo.findById(
          menuItemId,
          tenantId,
          client
        );
        if (!item) {
          throw new Error("Menu item not found");
        }

        // 3 - Verify modifier group exists
        const group = await this.modifierRepo.findGroupById(
          modifierGroupId,
          tenantId,
          client
        );
        if (!group) {
          throw new Error("Modifier group not found");
        }

        // 4 - Check if already attached
        const isAttached = await this.itemModifierRepo.isAttached(
          menuItemId,
          modifierGroupId,
          tenantId,
          client
        );
        if (isAttached) {
          throw new Error(
            "This modifier group is already attached to the menu item"
          );
        }

        // 5 - Attach modifier to item and publish event
        await this.itemModifierRepo.attach(
          menuItemId,
          modifierGroupId,
          tenantId,
          isRequired,
          client
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

      // 6 - Return success
      return Ok(undefined);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to attach modifier"
      );
    }
  }
}
