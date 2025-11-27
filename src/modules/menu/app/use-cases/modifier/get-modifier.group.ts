import { Ok, Err, type Result } from "../../../../../shared/result.js";
import type { ModifierGroup } from "#modules/menu/domain/modifier.js";
import type { IModifierRepository } from "../../ports.js";

export class GetModifierGroupUseCase {
  constructor(private modifierRepo: IModifierRepository) {}

  async execute(input: {
    groupId: string;
    tenantId: string;
  }): Promise<Result<ModifierGroup | null, string>> {
    const { groupId, tenantId } = input;
    try {
      const group = await this.modifierRepo.findGroupById(groupId, tenantId);
      return Ok(group);
    } catch (error) {
      return Err(
        `Failed to get modifier group: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}
