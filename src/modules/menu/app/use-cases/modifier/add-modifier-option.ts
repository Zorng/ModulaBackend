/**
 * Add Modifier Option Use Case
 * Adds a new option to an existing modifier group (e.g., "Boba +$0.50")
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";
import { ModifierOption } from "../../../domain/entities.js";

// TODO: Import port interfaces
// import type { IModifierRepository, IPolicyPort } from "../../ports.js";

export class AddModifierOptionUseCase {
  constructor() // private modifierRepo: IModifierRepository,
  // private policyPort: IPolicyPort
  {}

  async execute(input: {
    tenantId: string;
    userId: string;
    modifierGroupId: string;
    label: string;
    priceAdjustmentUsd: number;
  }): Promise<Result<ModifierOption, string>> {
    const { tenantId, userId, modifierGroupId, label, priceAdjustmentUsd } =
      input;

    // TODO: Step 1 - Check permissions
    // const canManage = await this.policyPort.canManageModifiers(tenantId, userId);
    // if (!canManage) {
    //   return Err("Permission denied");
    // }

    // TODO: Step 2 - Verify modifier group exists
    // const group = await this.modifierRepo.findGroupById(modifierGroupId, tenantId);
    // if (!group) {
    //   return Err("Modifier group not found");
    // }

    // TODO: Step 3 - Create modifier option entity
    // const optionResult = ModifierOption.create({
    //   tenantId,
    //   modifierGroupId,
    //   label,
    //   priceAdjustmentUsd
    // });
    // if (optionResult.isErr()) {
    //   return Err(`Validation failed: ${optionResult.error}`);
    // }
    // const option = optionResult.value;

    // TODO: Step 4 - Save to database
    // await this.modifierRepo.saveOption(option);

    // TODO: Step 5 - Return success
    // return Ok(option);

    throw new Error(
      "Not implemented - uncomment and complete the TODOs above!"
    );
  }
}
