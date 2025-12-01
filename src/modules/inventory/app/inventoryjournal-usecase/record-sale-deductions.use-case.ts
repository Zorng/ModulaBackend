import { Ok, Err, type Result } from "../../../../shared/result.js";
import { InventoryJournalRepository } from "../../domain/repositories.js";
import { InventoryJournal } from "../../domain/entities.js";
import type { StockSaleDeductedV1 } from "../../../../shared/events.js";

export interface SaleDeductionInput {
  tenantId: string;
  branchId: string;
  refSaleId: string;
  lines: Array<{ stockItemId: string; qtyDeducted: number }>; // qtyDeducted as positive, will be negated
}

interface IEventBus {
  publishViaOutbox(event: StockSaleDeductedV1, client?: any): Promise<void>;
}

interface ITransactionManager {
  withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T>;
}

export class RecordSaleDeductionsUseCase {
  constructor(
    private journalRepo: InventoryJournalRepository,
    private eventBus: IEventBus,
    private txManager: ITransactionManager
  ) {}

  async execute(
    input: SaleDeductionInput
  ): Promise<Result<InventoryJournal[], string>> {
    const { tenantId, branchId, refSaleId, lines } = input;

    // Validation: must have at least one line
    if (!lines || lines.length === 0) {
      return Err("Sale deductions must include at least one line");
    }

    // Validation: all qtyDeducted must be positive (will be negated)
    for (const line of lines) {
      if (line.qtyDeducted <= 0) {
        return Err("Sale deduction quantities must be positive");
      }
    }

    try {
      let journals: InventoryJournal[] = [];

      await this.txManager.withTransaction(async (client) => {
        // Save all journal entries as negative deltas
        for (const line of lines) {
          const journal = await this.journalRepo.save({
            tenantId,
            branchId,
            stockItemId: line.stockItemId,
            delta: -Math.abs(line.qtyDeducted), // Ensure negative
            reason: "sale",
            refSaleId,
            createdBy: undefined, // System-generated
          });
          journals.push(journal);
        }

        // Publish consolidated event
        const event: StockSaleDeductedV1 = {
          type: "inventory.stock_sale_deducted",
          v: 1,
          tenantId,
          branchId,
          refSaleId,
          deductions: journals.map((j) => ({
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
        error instanceof Error
          ? error.message
          : "Failed to record sale deductions"
      );
    }
  }
}
