// TODO: Implement reporting queries (read-only)

import type { Pool } from "pg";

export interface ReportingRepository {
  getSalesReport(tenantId: string, filters: any): Promise<any>;
  getInventoryReport(tenantId: string, branchId: string): Promise<any>;
  getCashReport(tenantId: string, branchId: string, date: string): Promise<any>;
}

export class PgReportingRepository implements ReportingRepository {
  constructor(private pool: Pool) {}

  async getSalesReport(tenantId: string, filters: any): Promise<any> {
    // TODO: Implement SQL query from materialized views
    throw new Error("Not implemented");
  }

  async getInventoryReport(tenantId: string, branchId: string): Promise<any> {
    // TODO: Implement SQL query
    throw new Error("Not implemented");
  }

  async getCashReport(
    tenantId: string,
    branchId: string,
    date: string
  ): Promise<any> {
    // TODO: Implement SQL query
    throw new Error("Not implemented");
  }
}
