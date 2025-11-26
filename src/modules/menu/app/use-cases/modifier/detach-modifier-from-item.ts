import { Ok, Err, type Result } from "../../../../../shared/result.js";
import type {
  IMenuItemRepository,
  IModifierRepository,
  IMenuItemModifierRepository,
  IPolicyPort,
  ITransactionManager,
} from "../../../app/ports.js";

export class DetachModifierFromItemUseCase {
  constructor(
    private menuItemRepo: IMenuItemRepository,
    private modifierRepo: IModifierRepository,
    private itemModifierRepo: IMenuItemModifierRepository,
    private policyPort: IPolicyPort,
    private txManager: ITransactionManager
  ) {}

  async execute(input: {
    tenantId: string;
    userId: string;
    menuItemId: string;
    modifierGroupId: string;
  }): Promise<Result<void, string>> {
    const { tenantId, userId, menuItemId, modifierGroupId } = input;

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
      // 2-4 - All checks and writes in transaction
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

        // 4 - Check if currently attached
        const isAttached = await this.itemModifierRepo.isAttached(
          menuItemId,
          modifierGroupId,
          tenantId,
          client
        );
        if (!isAttached) {
          throw new Error(
            "This modifier group is not attached to the specified menu item"
          );
        }

        // 5 - Detach modifier from item
        await this.itemModifierRepo.detach(
          menuItemId,
          modifierGroupId,
          tenantId,
          client
        );
      });

      return Ok(undefined);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to detach modifier"
      );
    }
  }
}
