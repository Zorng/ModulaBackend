import { InventoryJournalRepository } from "#modules/inventory/infra/InventoryJournal.repository.js";
import { InventoryJournal } from "#modules/inventory/domain/entities.js";

export interface JournalMovementInput {
  tenantId: string;
  branchId: string;
  stockItemId: string;
  qty: number; // positive for waste
  note?: string;
  actorId?: string;
}

export class WasteStockUseCase {
  constructor(private journalRepo: InventoryJournalRepository) {}

  async execute(input: JournalMovementInput): Promise<InventoryJournal> {
    if (input.qty <= 0) throw new Error("Waste quantity must be positive");
    return this.journalRepo.save({
      tenantId: input.tenantId,
      branchId: input.branchId,
      stockItemId: input.stockItemId,
      delta: -input.qty,
      reason: "waste",
      note: input.note,
      actorId: input.actorId,
    });
  }
}
