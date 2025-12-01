import { StockItemRepository } from "../domain/repositories.js";
import { StockItem } from "../domain/entities.js";

export interface CreateStockItemInput {
  tenantId: string;
  name: string;
  unit_text: string;
  barcode?: string;
  default_cost_usd?: number;
  is_active: boolean;
}

export class CreateStockItemUseCase {
  constructor(private stockItemRepo: StockItemRepository) {}

  async execute(input: CreateStockItemInput): Promise<StockItem> {
    return this.stockItemRepo.save({
      tenantId: input.tenantId,
      name: input.name,
      unit_text: input.unit_text,
      barcode: input.barcode,
      default_cost_usd: input.default_cost_usd,
      is_active: input.is_active,
    });
  }
}
