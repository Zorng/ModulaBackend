import { Ok, Err, type Result } from "../../../../../shared/result.js";
import type { ModifierOption } from "#modules/menu/domain/modifier.js";
import type { IModifierRepository } from "../../ports.js";

export class ListModifierOptionUseCase {
    constructor(private modifierOptionRepo: IModifierRepository) {}

    async execute(input: {
        id: string;
        tenantId: string;
    }): Promise<Result<ModifierOption | null, string>> {
        const { id, tenantId } = input;

        try {
            const modifierOption = await this.modifierOptionRepo.findOptionById(id, tenantId);

            return Ok(modifierOption);
        } catch (error) {
            return Err(
              `Failed to list modifier group: ${
                error instanceof Error ? error.message : "Unknown error"
              }`
            );
        }
    }
}