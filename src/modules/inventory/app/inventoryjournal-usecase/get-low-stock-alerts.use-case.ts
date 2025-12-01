import { Ok, type Result } from "../../../../shared/result.js";
import {
  InventoryJournalRepository,
  StockItemRepository,
} from "../../domain/repositories.js";

export interface LowStockItem {
  stockItemId: string;
  name: string;
  unitText: string;
  onHand: number;
  minThreshold: number;
}

export interface GetLowStockAlertsOutput {
  branchId: string;
  items: LowStockItem[];
}

export class GetLowStockAlertsUseCase {
  constructor(
    private journalRepo: InventoryJournalRepository,
    private stockItemRepo: StockItemRepository
  ) {}

  async execute(
    branchId: string
  ): Promise<Result<GetLowStockAlertsOutput, string>> {
    try {
      const alerts = await this.journalRepo.getLowStockAlerts(branchId);

      // Fetch stock item details for enrichment
      const stockItemIds = alerts.map((a) => a.stockItemId);
      const stockItems = await Promise.all(
        stockItemIds.map((id) => this.stockItemRepo.findById(id))
      );

      // Build map for O(1) lookup
      const stockItemMap = new Map(
        stockItems.filter((si) => si !== null).map((si) => [si!.id, si!])
      );

      // Enrich alerts with stock item details
      const enrichedItems: LowStockItem[] = alerts
        .map((a) => {
          const stockItem = stockItemMap.get(a.stockItemId);
          if (!stockItem) return null;
          return {
            stockItemId: a.stockItemId,
            name: stockItem.name,
            unitText: stockItem.unitText,
            onHand: a.onHand,
            minThreshold: a.minThreshold,
          };
        })
        .filter((item): item is LowStockItem => item !== null);

      return Ok({
        branchId,
        items: enrichedItems,
      });
    } catch (error) {
      return Ok({
        branchId,
        items: [],
      });
    }
  }
}
