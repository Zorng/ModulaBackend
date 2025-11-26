import { Ok, Err, type Result } from "../../../../../shared/result.js";
import type { ModifierOption } from "#modules/menu/domain/modifier.js";
import type { IModifierRepository } from "../../ports.js";

export class ListModifierOptionsForGroupUseCase {
  constructor(private modifierRepo: IModifierRepository) {}

  async execute(input: {
    groupId: string;
    tenantId: string;
  }): Promise<Result<ModifierOption[], string>> {
    const { groupId, tenantId } = input;
    try {
      const options = await this.modifierRepo.findOptionsByGroupId(
        groupId,
        tenantId
      );
      return Ok(options);
    } catch (error) {
      return Err(
        `Failed to list modifier options: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}
