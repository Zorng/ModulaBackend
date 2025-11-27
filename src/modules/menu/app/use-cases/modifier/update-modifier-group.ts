import { Ok, Err, type Result } from "../../../../../shared/result.js";
import type { ModifierGroup } from "../../../domain/entities.js";
import type {
  IModifierRepository,
  IPolicyPort,
  IEventBus,
  ITransactionManager,
} from "../../ports.js";
import type { ModifierGroupUpdatedV1 } from "../../../../../shared/events.js";

export class UpdateModifierGroupUseCase {
  constructor(
    private modifierRepo: IModifierRepository,
    private policyPort: IPolicyPort,
    private eventBus: IEventBus,
    private txManager: ITransactionManager
  ) {}

  async execute(input: {
    tenantId: string;
    userId: string;
    groupId: string;
    name?: string;
    selectionType?: "SINGLE" | "MULTI";
  }): Promise<Result<ModifierGroup, string>> {
    const { tenantId, userId, groupId, name, selectionType } = input;

    if (name === undefined && selectionType === undefined) {
      return Err(
        "At least one field (name or selectionType) must be provided to update a modifier group"
      );
    }

    const canManage = await this.policyPort.canManageModifiers(
      tenantId,
      userId
    );
    if (!canManage) {
      return Err(
        "Permission denied: You don't have permission to manage modifiers"
      );
    }

    const group = await this.modifierRepo.findGroupById(groupId, tenantId);
    if (!group) {
      return Err("Modifier group not found");
    }

    const changes: {
      name?: string;
      selectionType?: "SINGLE" | "MULTI";
    } = {};

    if (name !== undefined) {
      const renameResult = group.rename(name);
      if (!renameResult.ok) {
        return Err(`Failed to rename modifier group: ${renameResult.error}`);
      }
      changes.name = name;
    }

    if (selectionType !== undefined) {
      const changeTypeResult = group.changeSelectionType(selectionType);
      if (!changeTypeResult.ok) {
        return Err(
          `Failed to update modifier group selection type: ${changeTypeResult.error}`
        );
      }
      changes.selectionType = selectionType;
    }

    await this.txManager.withTransaction(async (client) => {
      await this.modifierRepo.saveGroup(group, client);

      const event: ModifierGroupUpdatedV1 = {
        type: "menu.modifier_group_updated",
        v: 1,
        tenantId,
        modifierGroupId: group.id,
        changes,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      };

      await this.eventBus.publishViaOutbox(event, client);
    });

    return Ok(group);
  }
}
