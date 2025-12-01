import { InventoryJournalRepository } from "../domain/repositories.js";

export class RecordReopenUseCase {
  constructor(private journalRepo: InventoryJournalRepository) {}

  async execute(
    tenantId: string,
    branchId: string,
    lines: { stockItemId: string; delta: number; refSaleId: string }[]
  ): Promise<void> {
    for (const line of lines) {
      await this.journalRepo.save({
        tenantId,
        branchId,
        stockItemId: line.stockItemId,
        delta: line.delta,
        reason: "reopen",
        refSaleId: line.refSaleId,
      });
    }
  }
}
