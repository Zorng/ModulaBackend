// TODO: Implement sales repositories

import type { Pool } from "pg";

export interface SaleRepository {
  findById(id: string): Promise<any>;
  create(sale: any): Promise<any>;
  update(id: string, data: any): Promise<any>;
  addLineItem(saleId: string, line: any): Promise<any>;
  finalize(saleId: string, tenders: any[]): Promise<void>;
}

export class PgSaleRepository implements SaleRepository {
  constructor(private pool: Pool) {}

  async findById(id: string): Promise<any> {
    // TODO: Implement SQL query
    throw new Error("Not implemented");
  }

  async create(sale: any): Promise<any> {
    // TODO: Implement SQL insert
    throw new Error("Not implemented");
  }

  async update(id: string, data: any): Promise<any> {
    // TODO: Implement SQL update
    throw new Error("Not implemented");
  }

  async addLineItem(saleId: string, line: any): Promise<any> {
    // TODO: Implement SQL insert
    throw new Error("Not implemented");
  }

  async finalize(saleId: string, tenders: any[]): Promise<void> {
    // TODO: Implement finalization in transaction
    // Update sale status, insert tenders, write to outbox
    throw new Error("Not implemented");
  }
}
