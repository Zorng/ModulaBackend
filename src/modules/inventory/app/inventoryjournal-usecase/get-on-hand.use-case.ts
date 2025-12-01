import {
  InventoryJournalRepository,
  StockItemRepository,
  BranchStockRepository,
} from "../domain/repositories.js";
import { StockItem } from "../domain/entities.js";

export interface GetOnHandInput {
  tenantId: string;
  branchId: string;
  stockItemId?: string;
}

export interface OnHandItem {
  stockItemId: string;
  name: string;
  unit_text: string;
  on_hand: number;
  min_threshold: number;
  low_stock: boolean;
}

export class GetOnHandUseCase {
  constructor(
    private journalRepo: InventoryJournalRepository,
    private stockItemRepo: StockItemRepository,
    private branchStockRepo: BranchStockRepository
  ) {}

  async execute(
    input: GetOnHandInput
  ): Promise<{ branchId: string; items: OnHandItem[] }> {
    const stockItems = input.stockItemId
      ? ([await this.stockItemRepo.findById(input.stockItemId)].filter(
          Boolean
        ) as StockItem[])
      : await this.stockItemRepo.findByTenant(input.tenantId);

    const items: OnHandItem[] = [];
    for (const item of stockItems) {
      const onHand = await this.journalRepo.getOnHand(
        input.tenantId,
        input.branchId,
        item.id
      );
      const branchStock = await this.branchStockRepo.findByBranchAndItem(
        input.branchId,
        item.id
      );
      const minThreshold = branchStock?.minThreshold || 0;
      items.push({
        stockItemId: item.id,
        name: item.name,
        unit_text: item.unit_text,
        on_hand: onHand,
        min_threshold: minThreshold,
        low_stock: onHand <= minThreshold,
      });
    }
    return { branchId: input.branchId, items };
  }
}
