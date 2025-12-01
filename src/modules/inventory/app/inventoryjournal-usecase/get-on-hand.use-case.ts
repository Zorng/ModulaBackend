import {
  InventoryJournalRepository,
  BranchStockRepository,
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
    private branchStockRepo: BranchStockRepository
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

      // Note: We don't fetch stock item details here to avoid N+1 queries
      // The API layer should join this data if needed
      items.push({
        stockItemId: bs.stockItemId,
        name: "", // To be populated by API layer or another use case
        unitText: "", // To be populated by API layer
        onHand,
        minThreshold: bs.minThreshold,
        lowStock: onHand <= bs.minThreshold,
      });
    }

    return { branchId, items };
  }
}
