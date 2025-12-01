import { Ok, type Result } from "../../../../shared/result.js";
import {
  InventoryJournalRepository,
  StockItemRepository,
  BranchStockRepository,
} from "../../domain/repositories.js";

export interface NegativeStockException {
  type: "negative_stock";
  stockItemId: string;
  name: string;
  unitText: string;
  onHand: number;
  minThreshold: number;
}

export interface UnmappedSaleException {
  type: "unmapped_sale";
  saleId: string;
  menuItemId: string;
  occurredAt: Date;
}

export interface GetInventoryExceptionsOutput {
  branchId: string;
  negativeStock: NegativeStockException[];
  unmappedSales: UnmappedSaleException[];
}

export class GetInventoryExceptionsUseCase {
  constructor(
    private journalRepo: InventoryJournalRepository,
    private stockItemRepo: StockItemRepository,
    private branchStockRepo: BranchStockRepository
  ) {}

  async execute(
    branchId: string
  ): Promise<Result<GetInventoryExceptionsOutput, string>> {
    try {
      // Get all stock items assigned to this branch
      const branchStocks = await this.branchStockRepo.findByBranch(branchId);

      // Calculate on-hand for each and find negative stock
      const negativeStockPromises = branchStocks.map(async (bs) => {
        const onHand = await this.journalRepo.getOnHand(
          bs.tenantId,
          branchId,
          bs.stockItemId
        );
        if (onHand < 0) {
          const stockItem = await this.stockItemRepo.findById(bs.stockItemId);
          if (stockItem) {
            return {
              type: "negative_stock" as const,
              stockItemId: bs.stockItemId,
              name: stockItem.name,
              unitText: stockItem.unitText,
              onHand,
              minThreshold: bs.minThreshold,
            };
          }
        }
        return null;
      });

      const negativeStockResults = await Promise.all(negativeStockPromises);
      const negativeStock = negativeStockResults.filter(
        (item): item is NegativeStockException => item !== null
      );

      // TODO: Implement unmapped sales detection
      // This would require querying sales journal for sales that don't have corresponding menu_stock_map entries
      // For now, return empty array as this requires cross-module integration
      const unmappedSales: UnmappedSaleException[] = [];

      return Ok({
        branchId,
        negativeStock,
        unmappedSales,
      });
    } catch (error) {
      return Ok({
        branchId,
        negativeStock: [],
        unmappedSales: [],
      });
    }
  }
}
