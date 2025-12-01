import { InventoryJournalRepository } from "../domain/repositories.js";
import { InventoryJournal } from "../domain/entities.js";

export interface CorrectionInput {
  tenantId: string;
  branchId: string;
  stockItemId: string;
  delta: number;
  note?: string;
  actorId?: string;
}

export class CorrectStockUseCase {
  constructor(private journalRepo: InventoryJournalRepository) {}

  async execute(input: CorrectionInput): Promise<InventoryJournal> {
    if (input.delta === 0) throw new Error("Correction delta cannot be zero");
    return this.journalRepo.save({
      tenantId: input.tenantId,
      branchId: input.branchId,
      stockItemId: input.stockItemId,
      delta: input.delta,
      reason: "correction",
      note: input.note,
      actorId: input.actorId,
    });
  }
}
