import { Ok, Err, type Result } from "../../../../shared/result.js";
import {
  InventoryJournalRepository,
  StockItemRepository,
  BranchStockRepository,
} from "../../domain/repositories.js";
import { InventoryJournal } from "../../domain/entities.js";
import type { StockReceivedV1 } from "../../../../shared/events.js";

export interface ReceiveStockInput {
  tenantId: string;
  branchId: string;
  stockItemId: string;
  qty: number; // positive for receive
  note?: string;
  actorId?: string;
  occurredAt?: Date; // When the transaction actually occurred (defaults to now)
}

interface IEventBus {
  publishViaOutbox(event: StockReceivedV1, client?: any): Promise<void>;
}

interface ITransactionManager {
  withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T>;
}

export class ReceiveStockUseCase {
  constructor(
    private journalRepo: InventoryJournalRepository,
    private stockItemRepo: StockItemRepository,
    private branchStockRepo: BranchStockRepository,
    private eventBus: IEventBus,
    private txManager: ITransactionManager
  ) {}

  async execute(
    input: ReceiveStockInput
  ): Promise<Result<InventoryJournal, string>> {
    const { tenantId, branchId, stockItemId, qty, note, actorId } = input;

    // Validation: qty must be positive
    if (qty <= 0) {
      return Err("Receive quantity must be positive");
    }

    // Verify stock item exists
    const stockItem = await this.stockItemRepo.findById(stockItemId);
    if (!stockItem) {
      return Err("Stock item not found");
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
        // Save journal entry
        journal = await this.journalRepo.save({
          tenantId,
          branchId,
          stockItemId,
          delta: qty,
          reason: "receive",
          note,
          actorId,
          occurredAt: input.occurredAt || new Date(),
          createdBy: actorId,
        });

        // Publish event
        const event: StockReceivedV1 = {
          type: "inventory.stock_received",
          v: 1,
          tenantId,
          branchId,
          stockItemId,
          journalId: journal.id,
          delta: qty,
          note,
          actorId,
          createdAt: new Date().toISOString(),
        };

        await this.eventBus.publishViaOutbox(event, client);
      });

      return Ok(journal!);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to receive stock"
      );
    }
  }
}
