import { Ok, Err, type Result } from "../../../../shared/result.js";
import { InventoryJournalRepository } from "../../domain/repositories.js";
import { InventoryJournal } from "../../domain/entities.js";
import type { StockReopenedV1 } from "../../../../shared/events.js";

export interface ReopenSaleInput {
  tenantId: string;
  branchId: string;
  originalSaleId: string; // The voided sale
  newSaleId: string; // The new sale after reopen
  lines: Array<{ stockItemId: string; qtyToRededuct: number }>; // qtyToRededuct as positive, will be negated
}

interface IEventBus {
  publishViaOutbox(event: StockReopenedV1, client?: any): Promise<void>;
}

interface ITransactionManager {
  withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T>;
}

export class RecordReopenUseCase {
  constructor(
    private journalRepo: InventoryJournalRepository,
    private eventBus: IEventBus,
    private txManager: ITransactionManager
  ) {}

  async execute(
    input: ReopenSaleInput
  ): Promise<Result<InventoryJournal[], string>> {
    const { tenantId, branchId, originalSaleId, newSaleId, lines } = input;

    // Validation: must have at least one line
    if (!lines || lines.length === 0) {
      return Err("Reopen must include at least one line");
    }

    // Validation: all qtyToRededuct must be positive (will be negated)
    for (const line of lines) {
      if (line.qtyToRededuct <= 0) {
        return Err("Reopen rededuction quantities must be positive");
      }
    }

    try {
      let journals: InventoryJournal[] = [];

      await this.txManager.withTransaction(async (client) => {
        // Save all journal entries as negative deltas (re-deduct for new sale)
        for (const line of lines) {
          const journal = await this.journalRepo.save({
            tenantId,
            branchId,
            stockItemId: line.stockItemId,
            delta: -Math.abs(line.qtyToRededuct), // Ensure negative
            reason: "reopen",
            refSaleId: newSaleId, // Link to new sale
            createdBy: undefined, // System-generated
          });
          journals.push(journal);
        }

        // Publish consolidated event
        const event: StockReopenedV1 = {
          type: "inventory.stock_reopened",
          v: 1,
          tenantId,
          branchId,
          originalSaleId,
          newSaleId,
          redeductions: journals.map((j) => ({
            stockItemId: j.stockItemId,
            journalId: j.id,
            delta: j.delta,
          })),
          createdAt: new Date().toISOString(),
        };

        await this.eventBus.publishViaOutbox(event, client);
      });

      return Ok(journals);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to record reopen"
      );
    }
  }
}
