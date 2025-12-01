import { MenuStockMapRepository } from "../domain/repositories.js";
import { MenuStockMap } from "../domain/entities.js";

export interface SetMenuStockMapInput {
  menuItemId: string;
  stockItemId: string;
  qtyPerSale: number;
}

export class SetMenuStockMapUseCase {
  constructor(private menuStockMapRepo: MenuStockMapRepository) {}

  async execute(input: SetMenuStockMapInput): Promise<MenuStockMap> {
    // Upsert
    const existing = await this.menuStockMapRepo.findByMenuItem(
      input.menuItemId
    );
    if (existing) {
      // Assuming update method exists, but interface doesn't have update, so delete and save
      await this.menuStockMapRepo.delete(input.menuItemId);
    }
    return this.menuStockMapRepo.save({
      menuItemId: input.menuItemId,
      stockItemId: input.stockItemId,
      qtyPerSale: input.qtyPerSale,
    });
  }
}
