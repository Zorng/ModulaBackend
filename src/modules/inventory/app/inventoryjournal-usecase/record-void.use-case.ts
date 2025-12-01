import { Ok, Err, type Result } from "../../../../shared/result.js";
import { InventoryJournalRepository } from "../../domain/repositories.js";
import { InventoryJournal } from "../../domain/entities.js";
import type { StockVoidedV1 } from "../../../../shared/events.js";

export interface VoidSaleInput {
  tenantId: string;
  branchId: string;
  refSaleId: string;
  originalLines: Array<{ stockItemId: string; qtyOriginallyDeducted: number }>; // qtyOriginallyDeducted as positive, will be added back
}

interface IEventBus {
  publishViaOutbox(event: StockVoidedV1, client?: any): Promise<void>;
}

interface ITransactionManager {
  withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T>;
}

export class RecordVoidUseCase {
  constructor(
    private journalRepo: InventoryJournalRepository,
    private eventBus: IEventBus,
    private txManager: ITransactionManager
  ) {}

  async execute(
    input: VoidSaleInput
  ): Promise<Result<InventoryJournal[], string>> {
    const { tenantId, branchId, refSaleId, originalLines } = input;

    // Validation: must have at least one line
    if (!originalLines || originalLines.length === 0) {
      return Err("Void must include at least one line");
    }

    // Validation: all qtyOriginallyDeducted must be positive (reverses the negative delta)
    for (const line of originalLines) {
      if (line.qtyOriginallyDeducted <= 0) {
        return Err("Void reversal quantities must be positive");
      }
    }

    try {
      let journals: InventoryJournal[] = [];

      await this.txManager.withTransaction(async (client) => {
        // Save all journal entries as positive deltas (reverses the sale deduction)
        for (const line of originalLines) {
          const journal = await this.journalRepo.save({
            tenantId,
            branchId,
            stockItemId: line.stockItemId,
            delta: Math.abs(line.qtyOriginallyDeducted), // Ensure positive
            reason: "void",
            refSaleId,
            createdBy: undefined, // System-generated
          });
          journals.push(journal);
        }

        // Publish consolidated event
        const event: StockVoidedV1 = {
          type: "inventory.stock_voided",
          v: 1,
          tenantId,
          branchId,
          refSaleId,
          reversals: journals.map((j) => ({
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
        error instanceof Error ? error.message : "Failed to record void"
      );
    }
  }
}
