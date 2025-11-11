// TODO: Implement inventory repositories

import type { Pool } from "pg";

export interface StockRepository {
  getBranchStock(branchId: string, stockItemId: string): Promise<any>;
  adjustStock(
    branchId: string,
    stockItemId: string,
    delta: number
  ): Promise<void>;
  createJournalEntry(entry: any): Promise<void>;
}

export class PgStockRepository implements StockRepository {
  constructor(private pool: Pool) {}

  async getBranchStock(branchId: string, stockItemId: string): Promise<any> {
    // TODO: Implement SQL query
    throw new Error("Not implemented");
  }

  async adjustStock(
    branchId: string,
    stockItemId: string,
    delta: number
  ): Promise<void> {
    // TODO: Implement SQL query with transaction
    throw new Error("Not implemented");
  }

  async createJournalEntry(entry: any): Promise<void> {
    // TODO: Implement SQL insert to inventory_journal
    throw new Error("Not implemented");
  }
}
