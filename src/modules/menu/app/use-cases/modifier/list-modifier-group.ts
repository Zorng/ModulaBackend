import { Ok, Err, type Result } from "../../../../../shared/result.js";
import type { ModifierGroup } from "#modules/menu/domain/modifier.js";
import type { IModifierRepository } from "../../ports.js";

export class ListModifierGroupUseCase {
    constructor(private modifierGroupRepo: IModifierRepository) {}

    async execute(input: {
        tenantId: string;
    }): Promise<Result<ModifierGroup[], string>> {
        const { tenantId } = input;

        try {
            const modifieGroups = await this.modifierGroupRepo.findGroupsByTenantId(tenantId);

            return Ok(modifieGroups);
        } catch (error) {
            return Err(
              `Failed to list modifier group: ${
                error instanceof Error ? error.message : "Unknown error"
              }`
            );
        }
    }
}