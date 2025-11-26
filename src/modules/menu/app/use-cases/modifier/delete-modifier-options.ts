import { Ok, Err, type Result } from "../../../../../shared/result.js";
import type { ModifierOptionDeletedV1 } from "../../../../../shared/events.js";
import type {
  IModifierRepository,
  IPolicyPort,
  ITransactionManager,
  IEventBus,
} from "../../ports.js";

export class DeleteModifierOptionUseCase {
  constructor(
    private modifierRepo: IModifierRepository,
    private policyPort: IPolicyPort,
    private txManager: ITransactionManager,
    private eventBus: IEventBus
  ) {}

  async execute(input: {
    tenantId: string;
    userId: string;
    optionId: string;
  }): Promise<Result<void, string>> {
    const { tenantId, userId, optionId } = input;

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
      // 2 - Load, delete, and publish event in a transaction
      await this.txManager.withTransaction(async (client) => {
        // 2.1 - Ensure option exists
        const option = await this.modifierRepo.findOptionById(
          optionId,
          tenantId,
          client
        );
        if (!option) {
          throw new Error("Modifier option not found");
        }

        // 2.2 - Delete (soft delete in repo: sets is_active=false)
        await this.modifierRepo.deleteOption(optionId, tenantId, client);

        // 2.3 - Publish delete event
        const event: ModifierOptionDeletedV1 = {
          type: "menu.modifier_option_deleted",
          v: 1,
          tenantId,
          modifierGroupId: option.modifierGroupId,
          modifierOptionId: option.id,
          label: option.label,
          deletedBy: userId,
          deletedAt: new Date().toISOString(),
        };

        await this.eventBus.publishViaOutbox(event, client);
      });

      return Ok(undefined);
    } catch (error) {
      return Err(
        `Failed to delete modifier option: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}
