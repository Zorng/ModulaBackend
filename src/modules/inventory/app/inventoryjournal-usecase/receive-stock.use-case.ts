import { InventoryJournalRepository } from "../domain/repositories.js";
import { InventoryJournal } from "../domain/entities.js";

export interface JournalMovementInput {
  tenantId: string;
  branchId: string;
  stockItemId: string;
  qty: number; // positive for receive
  note?: string;
  actorId?: string;
}

export class ReceiveStockUseCase {
  constructor(private journalRepo: InventoryJournalRepository) {}

  async execute(input: JournalMovementInput): Promise<InventoryJournal> {
    if (input.qty <= 0) throw new Error("Receive quantity must be positive");
    return this.journalRepo.save({
      tenantId: input.tenantId,
      branchId: input.branchId,
      stockItemId: input.stockItemId,
      delta: input.qty,
      reason: "receive",
      note: input.note,
      actorId: input.actorId,
    });
  }
}
