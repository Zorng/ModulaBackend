import { Ok, type Result } from "../../../../shared/result.js";
import { InventoryJournalRepository } from "../../domain/repositories.js";
import { InventoryJournal, InventoryReason } from "../../domain/entities.js";

export interface GetInventoryJournalInput {
  branchId: string;
  stockItemId?: string;
  reason?: InventoryReason;
  fromDate?: Date;
  toDate?: Date;
  page?: number;
  pageSize?: number;
}

export interface GetInventoryJournalOutput {
  entries: InventoryJournal[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export class GetInventoryJournalUseCase {
  constructor(private journalRepo: InventoryJournalRepository) {}

  async execute(
    input: GetInventoryJournalInput
  ): Promise<Result<GetInventoryJournalOutput, string>> {
    try {
      const entries = await this.journalRepo.findByBranch(input.branchId, {
        stockItemId: input.stockItemId,
        fromDate: input.fromDate,
        toDate: input.toDate,
      });

      // Filter by reason if provided
      const filtered = input.reason
        ? entries.filter((e) => e.reason === input.reason)
        : entries;

      // Paginate
      const page = input.page || 1;
      const pageSize = input.pageSize || 20;
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      const paginated = filtered.slice(start, end);

      return Ok({
        entries: paginated,
        total: filtered.length,
        page,
        pageSize,
        hasMore: end < filtered.length,
      });
    } catch (error) {
      return Ok({
        entries: [],
        total: 0,
        page: input.page || 1,
        pageSize: input.pageSize || 20,
        hasMore: false,
      });
    }
  }
}
