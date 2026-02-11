import type { ReportingRepository } from "../infra/queries.js";
import type {
  CashSessionReportDetail,
  CashSessionReportListItem,
  CashSessionStatusFilter,
  ZReportSummary,
} from "../domain/read-models.js";

export class ReportingService {
  constructor(private repo: ReportingRepository) {}

  async listCashSessionReports(params: {
    tenantId: string;
    branchId: string;
    openedById?: string;
    status?: CashSessionStatusFilter;
    from?: Date;
    to?: Date;
  }): Promise<CashSessionReportListItem[]> {
    return this.repo.listCashSessionReports({
      tenantId: params.tenantId,
      branchId: params.branchId,
      openedById: params.openedById,
      status: params.status ?? "ALL",
      from: params.from,
      to: params.to,
    });
  }

  async getCashSessionReportDetail(params: {
    tenantId: string;
    branchId: string;
    sessionId: string;
  }): Promise<CashSessionReportDetail | null> {
    return this.repo.getCashSessionReportDetail(params);
  }

  async getZReportSummary(params: {
    tenantId: string;
    branchId: string;
    date: string;
  }): Promise<ZReportSummary> {
    return this.repo.getZReportSummary(params);
  }
}
