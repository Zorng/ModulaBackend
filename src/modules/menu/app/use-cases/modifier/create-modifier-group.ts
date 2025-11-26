/**
 * Create Modifier Group Use Case
 * Creates a new modifier group (e.g., "Sugar Level", "Toppings")
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";
import { ModifierGroup } from "../../../domain/entities.js";
import type {
  IModifierRepository,
  IPolicyPort,
  IEventBus,
  ITransactionManager,
} from "../../../app/ports.js";

import { ModifierGroupCreatedV1 } from "../../../../../shared/events.js";

export class CreateModifierGroupUseCase {
  constructor(
    private modifierRepo: IModifierRepository,
    private policyPort: IPolicyPort,
    private eventBus: IEventBus,
    private txManager: ITransactionManager
  ) {}

  async execute(input: {
    tenantId: string;
    userId: string;
    name: string;
    selectionType: "SINGLE" | "MULTI";
  }): Promise<Result<ModifierGroup, string>> {
    const { tenantId, userId, name, selectionType } = input;

    // Step 1 - Check permissions
    const canCreate = await this.policyPort.canManageModifiers(
      tenantId,
      userId
    );
    if (!canCreate) {
      return Err(
        "Permission denied: You don't have permission to manage modifiers"
      );
    }

    // Step 2 - Create modifier group entity
    const groupResult = ModifierGroup.create({
      tenantId,
      name,
      selectionType,
      createdBy: userId,
    });

    if (!groupResult.ok) {
      return Err(`Validation failed: ${groupResult.error}`);
    }

    const group = groupResult.value;

    // Step 3 - Save and publish event
    await this.txManager.withTransaction(async (client) => {
      await this.modifierRepo.saveGroup(group);

      const event: ModifierGroupCreatedV1 = {
        type: "menu.modifier_group_created",
        v: 1,
        tenantId,
        modifierGroupId: group.id,
        name: group.name,
        selectionType: group.selectionType,
        createdBy: userId,
        createdAt: new Date().toISOString(),
      };

      await this.eventBus.publishViaOutbox(event, client);
    });

    // Step 5 - Return success
    return Ok(group);
  }
}
