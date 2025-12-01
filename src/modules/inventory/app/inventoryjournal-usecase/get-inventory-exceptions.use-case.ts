import { InventoryJournalRepository } from "../domain/repositories.js";

export interface InventoryException {
  type: "negative_stock" | "unmapped_sale";
  stockItemId?: string;
  name?: string;
  on_hand?: number;
  saleId?: string;
  menuItemId?: string;
  occurredAt?: Date;
}

export class GetInventoryExceptionsUseCase {
  // Simplified, as exceptions might need more logic
  constructor(private journalRepo: InventoryJournalRepository) {}

  async execute(
    branchId: string
  ): Promise<{
    branchId: string;
    negative_stock: InventoryException[];
    unmapped_sales: InventoryException[];
  }> {
    // This would need additional logic to detect unmapped sales, perhaps from sales module
    const alerts = await this.journalRepo.getLowStockAlerts(branchId);
    const negativeStock = alerts
      .filter((a) => a.onHand < 0)
      .map((a) => ({
        type: "negative_stock" as const,
        stockItemId: a.stockItemId,
        on_hand: a.onHand,
      }));
    return {
      branchId,
      negative_stock: negativeStock,
      unmapped_sales: [], // TODO: implement
    };
  }
}
