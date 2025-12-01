import { InventoryJournalRepository } from "../domain/repositories.js";
import { InventoryJournal } from "../domain/entities.js";

export interface GetInventoryJournalInput {
  branchId: string;
  stockItemId?: string;
  reason?: string;
  fromDate?: Date;
  toDate?: Date;
  page?: number;
  pageSize?: number;
}

export class GetInventoryJournalUseCase {
  constructor(private journalRepo: InventoryJournalRepository) {}

  async execute(
    input: GetInventoryJournalInput
  ): Promise<{ entries: InventoryJournal[]; nextPage?: number }> {
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
    const start = input.page ? (input.page - 1) * (input.pageSize || 20) : 0;
    const end = start + (input.pageSize || 20);
    const paginated = filtered.slice(start, end);
    const nextPage = end < filtered.length ? (input.page || 1) + 1 : undefined;
    return { entries: paginated, nextPage };
  }
}
