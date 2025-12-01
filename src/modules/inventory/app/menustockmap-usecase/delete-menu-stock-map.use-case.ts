import { Ok, Err, type Result } from "../../../../shared/result.js";
import { MenuStockMapRepository } from "../../domain/repositories.js";

export interface DeleteMenuStockMapInput {
  id: string; // The mapping ID to delete
}

export class DeleteMenuStockMapUseCase {
  constructor(private menuStockMapRepo: MenuStockMapRepository) {}

  async execute(input: DeleteMenuStockMapInput): Promise<Result<void, string>> {
    try {
      // Verify mapping exists before deleting
      const mapping = await this.menuStockMapRepo.findById(input.id);
      if (!mapping) {
        return Err("Menu stock mapping not found");
      }

      await this.menuStockMapRepo.delete(input.id);
      return Ok(undefined);
    } catch (error) {
      return Err(
        error instanceof Error
          ? error.message
          : "Failed to delete menu stock map"
      );
    }
  }

  async executeDeleteByMenuItem(
    menuItemId: string
  ): Promise<Result<void, string>> {
    try {
      await this.menuStockMapRepo.deleteByMenuItem(menuItemId);
      return Ok(undefined);
    } catch (error) {
      return Err(
        error instanceof Error
          ? error.message
          : "Failed to delete menu stock mappings"
      );
    }
  }
}
