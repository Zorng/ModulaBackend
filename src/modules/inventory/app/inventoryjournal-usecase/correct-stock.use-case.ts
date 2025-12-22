import { Ok, Err, type Result } from "../../../../shared/result.js";
import {
  InventoryJournalRepository,
  BranchStockRepository,
} from "../../domain/repositories.js";
import { InventoryJournal } from "../../domain/entities.js";
import type { StockCorrectedV1 } from "../../../../shared/events.js";
import type { AuditWriterPort } from "../../../../shared/ports/audit.js";

export interface CorrectStockInput {
  tenantId: string;
  branchId: string;
  stockItemId: string;
  delta: number; // can be positive or negative
  note: string; // mandatory per spec
  actorId?: string;
  actorRole?: string | null;
  occurredAt?: Date; // When the transaction actually occurred (defaults to now)
}

interface IEventBus {
  publishViaOutbox(event: StockCorrectedV1, client?: any): Promise<void>;
}

interface ITransactionManager {
  withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T>;
}

export class CorrectStockUseCase {
  constructor(
    private journalRepo: InventoryJournalRepository,
    private branchStockRepo: BranchStockRepository,
    private eventBus: IEventBus,
    private txManager: ITransactionManager,
    private auditWriter: AuditWriterPort
  ) {}

  async execute(
    input: CorrectStockInput
  ): Promise<Result<InventoryJournal, string>> {
    const { tenantId, branchId, stockItemId, delta, note, actorId } = input;

    // Validation: delta cannot be zero
    if (delta === 0) {
      return Err("Correction delta cannot be zero");
    }

    // Validation: note is required for corrections
    if (!note || note.trim().length === 0) {
      return Err("Note is required for correction entries");
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
          delta,
          reason: "correction",
          note: note.trim(),
          actorId,
          occurredAt: input.occurredAt || new Date(),
          createdBy: actorId,
        });

        await this.auditWriter.write(
          {
            tenantId,
            branchId,
            employeeId: actorId,
            actorRole: input.actorRole ?? null,
            actionType: "INVENTORY_JOURNAL_APPENDED",
            resourceType: "inventory_journal",
            resourceId: journal.id,
            details: {
              reason: "correction",
              stockItemId,
              delta,
              note: note.trim(),
              occurredAt: journal.occurredAt.toISOString(),
            },
          },
          client
        );

        // Publish event
        const event: StockCorrectedV1 = {
          type: "inventory.stock_corrected",
          v: 1,
          tenantId,
          branchId,
          stockItemId,
          journalId: journal.id,
          delta,
          note: note.trim(),
          actorId,
          createdAt: new Date().toISOString(),
        };

        await this.eventBus.publishViaOutbox(event, client);
      });

      return Ok(journal!);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to record correction"
      );
    }
  }
}
