import {
  BranchStockRepository,
  StockItemRepository,
} from "../domain/repositories.js";

export interface GetBranchStockItemsInput {
  branchId: string;
  tenantId: string; // Added for fetching stock items
}

export class GetBranchStockItemsUseCase {
  constructor(
    private branchStockRepo: BranchStockRepository,
    private stockItemRepo: StockItemRepository
  ) {}

  async execute(
    input: GetBranchStockItemsInput
  ): Promise<
    {
      stockItemId: string;
      name: string;
      unit_text: string;
      minThreshold: number;
    }[]
  > {
    const branchStocks = await this.branchStockRepo.findByBranch(
      input.branchId
    );
    const stockItems = await this.stockItemRepo.findByTenant(input.tenantId);
    // Map to combine
    return branchStocks.map((bs) => {
      const item = stockItems.find((si) => si.id === bs.stockItemId);
      return {
        stockItemId: bs.stockItemId,
        name: item?.name || "",
        unit_text: item?.unit_text || "",
        minThreshold: bs.minThreshold,
      };
    });
  }
}
