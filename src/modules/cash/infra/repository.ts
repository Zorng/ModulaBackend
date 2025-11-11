// TODO: Implement cash repositories

import type { Pool } from "pg";

export interface CashSessionRepository {
  findById(id: string): Promise<any>;
  findActiveSession(branchId: string): Promise<any>;
  create(session: any): Promise<any>;
  close(sessionId: string, data: any): Promise<void>;
}

export class PgCashSessionRepository implements CashSessionRepository {
  constructor(private pool: Pool) {}

  async findById(id: string): Promise<any> {
    // TODO: Implement SQL query
    throw new Error("Not implemented");
  }

  async findActiveSession(branchId: string): Promise<any> {
    // TODO: Implement SQL query
    throw new Error("Not implemented");
  }

  async create(session: any): Promise<any> {
    // TODO: Implement SQL insert
    throw new Error("Not implemented");
  }

  async close(sessionId: string, data: any): Promise<void> {
    // TODO: Implement SQL update
    throw new Error("Not implemented");
  }
}
