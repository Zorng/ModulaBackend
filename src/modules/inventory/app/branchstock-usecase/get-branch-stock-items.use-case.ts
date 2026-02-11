import {
  BranchStockRepository,
  StockItemRepository,
} from "../../domain/repositories.js";

export interface GetBranchStockItemsInput {
  branchId: string;
  tenantId: string;
}

export interface BranchStockItemDTO {
  stockItemId: string;
  name: string;
  unitText: string;
  minThreshold: number;
  barcode?: string;
  isActive: boolean;
}

export class GetBranchStockItemsUseCase {
  constructor(
    private branchStockRepo: BranchStockRepository,
    private stockItemRepo: StockItemRepository
  ) {}

  async execute(
    input: GetBranchStockItemsInput
  ): Promise<BranchStockItemDTO[]> {
    const { branchId, tenantId } = input;

    // Get all branch stock links for this branch
    const branchStocks = await this.branchStockRepo.findByBranch(branchId);

    // Get all stock items for this tenant
    const stockItems = await this.stockItemRepo.findByTenant(tenantId);

    // Create a map for faster lookup
    const stockItemMap = new Map(stockItems.map((item) => [item.id, item]));

    // Combine branch stock with stock item details
    return branchStocks.flatMap((bs) => {
      const item = stockItemMap.get(bs.stockItemId);
      if (!item) return []; // Skip if stock item not found

      return [
        {
          stockItemId: bs.stockItemId,
          name: item.name,
          unitText: item.unitText,
          minThreshold: bs.minThreshold,
          barcode: item.barcode,
          isActive: item.isActive,
        },
      ];
    });
  }
}
