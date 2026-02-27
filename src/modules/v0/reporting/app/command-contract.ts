export type V0ReportingBranchScope = "BRANCH" | "ALL_BRANCHES";
export type V0ReportingWindow = "day" | "week" | "month" | "custom";

export type V0ReportingSalesStatusFilter =
  | "ALL"
  | "FINALIZED"
  | "VOID_PENDING"
  | "VOIDED";

export type V0ReportingRestockCostFilter = "ALL" | "KNOWN" | "UNKNOWN";

export type V0ReportingViewType =
  | "SALES_SUMMARY"
  | "SALES_DRILL_DOWN"
  | "RESTOCK_SPEND_SUMMARY"
  | "RESTOCK_SPEND_DRILL_DOWN"
  | "ATTENDANCE_SUMMARY"
  | "ATTENDANCE_DRILL_DOWN";

export const V0_REPORTING_ACTION_KEYS = {
  salesSummary: "reports.sales.summary",
  salesDrillDown: "reports.sales.drillDown",
  restockSpendSummary: "reports.restockSpend.summary",
  restockSpendDrillDown: "reports.restockSpend.drillDown",
  attendanceSummary: "reports.attendance.summary",
  attendanceDrillDown: "reports.attendance.drillDown",
} as const;

export const V0_REPORTING_AUDIT_EVENT_KEYS = {
  reportViewed: "REPORT_VIEWED",
} as const;

export function buildReportViewedMetadata(input: {
  reportType: V0ReportingViewType;
  branchScope: V0ReportingBranchScope;
  branchId: string | null;
  from: string;
  to: string;
  timezone?: string | null;
  filters?: Record<string, unknown> | null;
}): Record<string, unknown> {
  return {
    reportType: input.reportType,
    scope: {
      branchScope: input.branchScope,
      branchId: input.branchId,
      from: input.from,
      to: input.to,
      timezone: input.timezone ?? "Asia/Phnom_Penh",
    },
    filters: input.filters ?? {},
  };
}
