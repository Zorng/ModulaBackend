import { Ok, Err, type Result } from "../../../../../shared/result.js";
import type { ModifierGroupDeletedV1 } from "../../../../../shared/events.js";
import type {
  IModifierRepository,
  IMenuItemModifierRepository,
  IPolicyPort,
  ITransactionManager,
  IEventBus,
} from "../../ports.js";

/**
 * Hard delete modifier group use case
 * Physically removes the group (and, via DB cascade, its options/attachments)
 */
export class HardDeleteModifierGroupUseCase {
  constructor(
    private modifierRepo: IModifierRepository,
    private itemModifierRepo: IMenuItemModifierRepository,
    private policyPort: IPolicyPort,
    private txManager: ITransactionManager,
    private eventBus: IEventBus
  ) {}

  async execute(input: {
    tenantId: string;
    userId: string;
    groupId: string;
  }): Promise<Result<void, string>> {
    const { tenantId, userId, groupId } = input;

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

    try {
      // 2 - Run checks, hard delete, and publish event in a transaction
      await this.txManager.withTransaction(async (client) => {
        // 2.1 - Ensure group exists for this tenant
        const group = await this.modifierRepo.findGroupById(
          groupId,
          tenantId,
          client
        );
        if (!group) {
          throw new Error("Modifier group not found");
        }

        // 2.2 - (Optional) still prevent delete when attached
        const hasAnyAttachments = await this.itemModifierRepo.hasAnyForGroup(
          groupId,
          tenantId,
          client
        );

        if (hasAnyAttachments) {
          throw new Error(
            `Cannot hard delete modifier group "${group.name}" because it is attached to one or more menu items. ` +
              `Detach it from all items before deleting.`
          );
        }

        // 2.3 - Hard delete (relies on DB ON DELETE CASCADE for children)
        await this.modifierRepo.deleteGroup(groupId, tenantId, client);

        // 2.4 - Publish delete event
        const event: ModifierGroupDeletedV1 = {
          type: "menu.modifier_group_deleted",
          v: 1,
          tenantId,
          modifierGroupId: group.id,
          name: group.name,
          deletedBy: userId,
          deletedAt: new Date().toISOString(),
        };

        await this.eventBus.publishViaOutbox(event, client);
      });

      return Ok(undefined);
    } catch (error) {
      return Err(
        `Failed to hard delete modifier group: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}
