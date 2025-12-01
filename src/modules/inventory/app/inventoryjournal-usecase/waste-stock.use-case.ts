import { Ok, Err, type Result } from "../../../../shared/result.js";
import {
  InventoryJournalRepository,
  BranchStockRepository,
} from "../../domain/repositories.js";
import { InventoryJournal } from "../../domain/entities.js";
import type { StockWastedV1 } from "../../../../shared/events.js";

export interface WasteStockInput {
  tenantId: string;
  branchId: string;
  stockItemId: string;
  qty: number; // positive for waste (will be converted to negative delta)
  note: string; // mandatory per spec
  actorId?: string;
}

interface IEventBus {
  publishViaOutbox(event: StockWastedV1, client?: any): Promise<void>;
}

interface ITransactionManager {
  withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T>;
}

export class WasteStockUseCase {
  constructor(
    private journalRepo: InventoryJournalRepository,
    private branchStockRepo: BranchStockRepository,
    private eventBus: IEventBus,
    private txManager: ITransactionManager
  ) {}

  async execute(
    input: WasteStockInput
  ): Promise<Result<InventoryJournal, string>> {
    const { tenantId, branchId, stockItemId, qty, note, actorId } = input;

    // Validation: qty must be positive
    if (qty <= 0) {
      return Err("Waste quantity must be positive");
    }

    // Validation: note is required for waste
    if (!note || note.trim().length === 0) {
      return Err("Note is required for waste entries");
    }

    // Verify stock item is assigned to branch
    const branchStock = await this.branchStockRepo.findByBranchAndItem(
      branchId,
      stockItemId
    );
    if (!branchStock) {
      return Err("Stock item is not assigned to this branch");
    }

    try {
      let journal: InventoryJournal;

      await this.txManager.withTransaction(async (client) => {
        // Save journal entry with negative delta
        journal = await this.journalRepo.save({
          tenantId,
          branchId,
          stockItemId,
          delta: -Math.abs(qty), // Ensure negative
          reason: "waste",
          note: note.trim(),
          actorId,
          createdBy: actorId,
        });

        // Publish event
        const event: StockWastedV1 = {
          type: "inventory.stock_wasted",
          v: 1,
          tenantId,
          branchId,
          stockItemId,
          journalId: journal.id,
          delta: -Math.abs(qty),
          note: note.trim(),
          actorId,
          createdAt: new Date().toISOString(),
        };

        await this.eventBus.publishViaOutbox(event, client);
      });

      return Ok(journal!);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to record waste"
      );
    }
  }
}
