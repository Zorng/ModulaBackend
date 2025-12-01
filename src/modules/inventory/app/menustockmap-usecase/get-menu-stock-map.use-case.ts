import { Ok, type Result } from "../../../../shared/result.js";
import { MenuStockMapRepository } from "../../domain/repositories.js";
import { MenuStockMap } from "../../domain/entities.js";

export class GetMenuStockMapUseCase {
  constructor(private menuStockMapRepo: MenuStockMapRepository) {}

  async execute(menuItemId: string): Promise<Result<MenuStockMap[], string>> {
    try {
      const mappings = await this.menuStockMapRepo.findByMenuItem(menuItemId);
      return Ok(mappings);
    } catch (error) {
      return Ok([]);
    }
  }

  async executeGetAll(): Promise<Result<MenuStockMap[], string>> {
    try {
      const mappings = await this.menuStockMapRepo.findAll();
      return Ok(mappings);
    } catch (error) {
      return Ok([]);
    }
  }

  async executeGetById(
    id: string
  ): Promise<Result<MenuStockMap | null, string>> {
    try {
      const mapping = await this.menuStockMapRepo.findById(id);
      return Ok(mapping);
    } catch (error) {
      return Ok(null);
    }
  }
}
