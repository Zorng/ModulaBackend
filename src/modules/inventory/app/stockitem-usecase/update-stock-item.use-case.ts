import { StockItemRepository } from "../domain/repositories.js";
import { StockItem } from "../domain/entities.js";

export interface UpdateStockItemInput {
  name?: string;
  unit_text?: string;
  barcode?: string;
  default_cost_usd?: number;
  is_active?: boolean;
}

export class UpdateStockItemUseCase {
  constructor(private stockItemRepo: StockItemRepository) {}

  async execute(
    stockItemId: string,
    input: UpdateStockItemInput
  ): Promise<StockItem | null> {
    return this.stockItemRepo.update(stockItemId, input);
  }
}
