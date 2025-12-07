import { Ok, Err, type Result } from "../../../../../shared/result.js";
import { ModifierOption } from "../../../domain/entities.js";
import type {
  IModifierRepository,
  ITenantLimitsRepository,
  IPolicyPort,
  IEventBus,
  ITransactionManager,
} from "../../../app/ports.js";
import { ModifierOptionAddedV1 } from "../../../../../shared/events.js";

export class AddModifierOptionUseCase {
  constructor(
    private modifierRepo: IModifierRepository,
    private limitsRepo: ITenantLimitsRepository,
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

    // 2 - Check quota limits (outside transaction)
    // TODO: Tenant limits module not complete - bypassing for now
    // const limits = await this.limitsRepo.findByTenantId(tenantId);
    // if (!limits) {
    //   return Err("Tenant limits not found. Please contact support.");
    // }

    // const currentCount = await this.modifierRepo.countOptionsByGroupId(
    //   modifierGroupId,
    //   tenantId
    // );
    // const limitCheck = limits.checkModifierOptionLimit(currentCount);

    // if (limitCheck.status === "exceeded") {
    //   return Err(limitCheck.message);
    // }

    // // Log warning if approaching limit
    // if (limitCheck.status === "warning") {
    //   console.warn(`[AddModifierOption] ${limitCheck.message}`);
    // }

    // 3 - Create modifier option entity (outside transaction)
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

    try {
      // 2, 4 - Database operations in transaction
      await this.txManager.withTransaction(async (client) => {
        // 2 - Verify modifier group exists
        const group = await this.modifierRepo.findGroupById(
          modifierGroupId,
          tenantId,
          client
        );
        if (!group) {
          throw new Error("Modifier group not found");
        }

        // 4 - Save and publish event
        await this.modifierRepo.saveOption(option, client);

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

      // 5 - Return success
      return Ok(option);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to add modifier option"
      );
    }
  }
}
