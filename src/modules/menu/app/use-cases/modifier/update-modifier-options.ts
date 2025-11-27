import { Ok, Err, type Result } from "../../../../../shared/result.js";
import type { ModifierOption } from "../../../domain/entities.js";
import type {
  IModifierRepository,
  IPolicyPort,
  IEventBus,
  ITransactionManager,
} from "../../ports.js";
import type { ModifierOptionUpdatedV1 } from "../../../../../shared/events.js";

export class UpdateModifierOptionUseCase {
  constructor(
    private modifierRepo: IModifierRepository,
    private policyPort: IPolicyPort,
    private eventBus: IEventBus,
    private txManager: ITransactionManager
  ) {}

  async execute(input: {
    tenantId: string;
    userId: string;
    optionId: string;
    label?: string;
    priceAdjustmentUsd?: number;
    isDefault?: boolean;
  }): Promise<Result<ModifierOption, string>> {
    const { tenantId, userId, optionId, label, priceAdjustmentUsd, isDefault } =
      input;

    if (
      label === undefined &&
      priceAdjustmentUsd === undefined &&
      isDefault === undefined
    ) {
      return Err(
        "At least one field (label, priceAdjustmentUsd, isDefault) must be provided to update a modifier option"
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

    const option = await this.modifierRepo.findOptionById(optionId, tenantId);
    if (!option) {
      return Err("Modifier option not found");
    }

    const updateResult = option.update({
      label,
      priceAdjustmentUsd,
      isDefault,
    });

    if (!updateResult.ok) {
      return Err(`Failed to update modifier option: ${updateResult.error}`);
    }

    const changes: {
      label?: string;
      priceAdjustmentUsd?: number;
      isDefault?: boolean;
    } = {};

    if (label !== undefined) changes.label = label;
    if (priceAdjustmentUsd !== undefined)
      changes.priceAdjustmentUsd = priceAdjustmentUsd;
    if (isDefault !== undefined) changes.isDefault = isDefault;

    await this.txManager.withTransaction(async (client) => {
      await this.modifierRepo.saveOption(option, client);

      const event: ModifierOptionUpdatedV1 = {
        type: "menu.modifier_option_updated",
        v: 1,
        tenantId,
        modifierGroupId: option.modifierGroupId,
        modifierOptionId: option.id,
        changes,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      };

      await this.eventBus.publishViaOutbox(event, client);
    });

    return Ok(option);
  }
}
