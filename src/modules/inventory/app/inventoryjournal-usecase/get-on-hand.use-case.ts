import {
  InventoryJournalRepository,
  BranchStockRepository,
  StockItemRepository,
} from "../../domain/repositories.js";

export interface GetOnHandInput {
  tenantId: string;
  branchId: string;
  stockItemId?: string;
}

export interface OnHandItem {
  stockItemId: string;
  name: string;
  unitText: string;
  onHand: number;
  minThreshold: number;
  lowStock: boolean;
}

export class GetOnHandUseCase {
  constructor(
    private journalRepo: InventoryJournalRepository,
    private branchStockRepo: BranchStockRepository,
    private stockItemRepo: StockItemRepository
  ) {}

  async execute(
    input: GetOnHandInput
  ): Promise<{ branchId: string; items: OnHandItem[] }> {
    const { tenantId, branchId, stockItemId } = input;

    // Get branch stock items (optionally filtered by stockItemId)
    const branchStocks = await this.branchStockRepo.findByBranch(branchId);

    // Filter if specific stock item requested
    const filteredBranchStocks = stockItemId
      ? branchStocks.filter((bs) => bs.stockItemId === stockItemId)
      : branchStocks;

    // Build on-hand items with computed quantities
    const items: OnHandItem[] = [];

    for (const bs of filteredBranchStocks) {
      const onHand = await this.journalRepo.getOnHand(
        tenantId,
        branchId,
        bs.stockItemId
      );

      // Fetch stock item details
      const stockItem = await this.stockItemRepo.findById(bs.stockItemId);

      items.push({
        stockItemId: bs.stockItemId,
        name: stockItem?.name || "",
        unitText: stockItem?.unitText || "",
        onHand,
        minThreshold: bs.minThreshold,
        lowStock: onHand <= bs.minThreshold,
      });
    }

    return { branchId, items };
  }
}
