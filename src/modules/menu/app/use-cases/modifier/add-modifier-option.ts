/**
 * Add Modifier Option Use Case
 * Adds a new option to an existing modifier group (e.g., "Boba +$0.50")
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";
import { ModifierOption } from "../../../domain/entities.js";
import type {
  IModifierRepository,
  IPolicyPort,
  IEventBus,
  ITransactionManager,
} from "../../ports.js";

import { ModifierOptionAddedV1 } from "../../../../../shared/events.js";

export class AddModifierOptionUseCase {
  constructor(
    private modifierRepo: IModifierRepository,
    private policyPort: IPolicyPort,
    private eventBus: IEventBus,
    private txManager: ITransactionManager
  ) {}

  async execute(input: {
    tenantId: string;
    userId: string;
    modifierGroupId: string;
    label: string;
    priceAdjustmentUsd: number;
    isDefault?: boolean;
  }): Promise<Result<ModifierOption, string>> {
    const {
      tenantId,
      userId,
      modifierGroupId,
      label,
      priceAdjustmentUsd,
      isDefault,
    } = input;

    //1 - Check permissions
    const canManage = await this.policyPort.canManageModifiers(
      tenantId,
      userId
    );
    if (!canManage) {
      return Err(
        "Permission denied: You don't have permission to manage modifiers"
      );
    }

    //2 - Verify modifier group exists
    const group = await this.modifierRepo.findGroupById(
      modifierGroupId,
      tenantId
    );
    if (!group) {
      return Err("Modifier group not found");
    }

    //3 - Create modifier option entity
    const optionResult = ModifierOption.create({
      modifierGroupId,
      label,
      priceAdjustmentUsd,
      isDefault,
    });

    if (!optionResult.ok) {
      return Err(`Validation failed: ${optionResult.error}`);
    }

    const option = optionResult.value;

    //4 - Save and publish event
    await this.txManager.withTransaction(async (client) => {
      await this.modifierRepo.saveOption(option);

      const event: ModifierOptionAddedV1 = {
        type: "menu.modifier_option_added",
        v: 1,
        tenantId,
        modifierGroupId,
        modifierOptionId: option.id,
        label: option.label,
        priceAdjustmentUsd: option.priceAdjustmentUsd,
        createdAt: new Date().toISOString(),
      };

      await this.eventBus.publishViaOutbox(event, client);
    });

    //5 - Return success
    return Ok(option);
  }
}
