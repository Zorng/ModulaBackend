import { InventoryJournalRepository } from "../domain/repositories.js";

export interface LowStockItem {
  stockItemId: string;
  name: string;
  on_hand: number;
  min_threshold: number;
}

export class GetLowStockAlertsUseCase {
  constructor(private journalRepo: InventoryJournalRepository) {}

  async execute(
    branchId: string
  ): Promise<{ branchId: string; items: LowStockItem[] }> {
    const alerts = await this.journalRepo.getLowStockAlerts(branchId);
    // Need to enrich with names, but interface doesn't have name, so assume we need to join
    // For now, return as is, but ideally fetch names
    return {
      branchId,
      items: alerts.map((a) => ({
        stockItemId: a.stockItemId,
        name: "", // TODO: fetch name
        on_hand: a.onHand,
        min_threshold: a.minThreshold,
      })),
    };
  }
}
