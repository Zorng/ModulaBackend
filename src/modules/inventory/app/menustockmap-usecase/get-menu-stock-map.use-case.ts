import { MenuStockMapRepository } from "../domain/repositories.js";
import { MenuStockMap } from "../domain/entities.js";

export class GetMenuStockMapUseCase {
  constructor(private menuStockMapRepo: MenuStockMapRepository) {}

  async execute(menuItemId: string): Promise<MenuStockMap | null> {
    return this.menuStockMapRepo.findByMenuItem(menuItemId);
  }
}
