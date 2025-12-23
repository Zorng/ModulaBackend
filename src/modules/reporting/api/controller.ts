import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../../../platform/security/auth.js";
import type { BranchQueryPort } from "../../../shared/ports/branch.js";
import type { ReportingService } from "../app/queries.js";
import type { CashSessionStatusFilter } from "../domain/read-models.js";
import type {
  ListXReportsQuery,
  ReportDetailQuery,
  ZReportSummaryQuery,
} from "./schemas.js";

const allowedRoles = new Set(["ADMIN", "MANAGER", "CASHIER"]);
const adminOnlyRoles = new Set(["ADMIN"]);

function resolveBranchId(params: {
  queryBranchId?: string;
  userBranchId?: string;
  role?: string;
}): { branchId: string | null; isForbidden: boolean } {
  const branchId = params.queryBranchId ?? params.userBranchId ?? null;
  const isCashier = params.role === "CASHIER";
  const isForbidden =
    isCashier &&
    params.queryBranchId !== undefined &&
    params.queryBranchId !== params.userBranchId;
  return { branchId, isForbidden };
}

async function assertBranchExists(params: {
  req: AuthenticatedRequest;
  tenantId: string;
  branchId: string;
}): Promise<boolean> {
  const branchQueryPort = (params.req as any).app?.locals
    ?.branchQueryPort as BranchQueryPort | undefined;
  if (!branchQueryPort) {
    return true;
  }
  try {
    await branchQueryPort.getBranch({
      tenantId: params.tenantId,
      branchId: params.branchId,
    });
    return true;
  } catch {
    return false;
  }
}

function mapStatusFilter(status?: string): CashSessionStatusFilter {
  if (status === "open") return "OPEN";
  if (status === "closed") return "CLOSED";
  return "ALL";
}

export class ReportingController {
  constructor(private reportingService: ReportingService) {}

  async listXReports(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId, employeeId, branchId: userBranchId, role } =
        req.user || {};
      if (!tenantId || !employeeId || !role) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!allowedRoles.has(role)) {
        return res
          .status(403)
          .json({ error: "Insufficient permissions" });
      }

      const query = ((req as any).validatedQuery ??
        req.query) as ListXReportsQuery;
      const { branchId, isForbidden } = resolveBranchId({
        queryBranchId: query.branchId,
        userBranchId,
        role,
      });

      if (isForbidden) {
        return res.status(403).json({ error: "Branch access denied" });
      }

      if (!branchId) {
        return res.status(400).json({ error: "branchId is required" });
      }

      const branchExists = await assertBranchExists({
        req,
        tenantId,
        branchId,
      });
      if (!branchExists) {
        return res.status(404).json({ error: "Branch not found" });
      }

      const reports = await this.reportingService.listCashSessionReports({
        tenantId,
        branchId,
        openedById: role === "CASHIER" ? employeeId : undefined,
        status: mapStatusFilter(query.status),
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
      });

      return res.json({
        success: true,
        data: reports.map((report) => ({
          id: report.id,
          status: report.status,
          openedByName: report.openedByName,
          openedAt: report.openedAt,
          closedAt: report.closedAt ?? null,
        })),
      });
    } catch (error) {
      next(error);
    }
  }

  async getXReportDetail(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId, employeeId, branchId: userBranchId, role } = req.user ||
        {};
      if (!tenantId || !employeeId || !role) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!allowedRoles.has(role)) {
        return res
          .status(403)
          .json({ error: "Insufficient permissions" });
      }

      const query = ((req as any).validatedQuery ??
        req.query) as ReportDetailQuery;
      const { branchId, isForbidden } = resolveBranchId({
        queryBranchId: query.branchId,
        userBranchId,
        role,
      });

      if (isForbidden) {
        return res.status(403).json({ error: "Branch access denied" });
      }

      if (!branchId) {
        return res.status(400).json({ error: "branchId is required" });
      }

      const branchExists = await assertBranchExists({
        req,
        tenantId,
        branchId,
      });
      if (!branchExists) {
        return res.status(404).json({ error: "Branch not found" });
      }

      const sessionId = req.params.sessionId;
      const report = await this.reportingService.getCashSessionReportDetail({
        tenantId,
        branchId,
        sessionId,
      });

      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      if (role === "CASHIER" && report.openedById !== employeeId) {
        return res.status(403).json({ error: "Access denied" });
      }

      return res.json({
        success: true,
        data: {
          id: report.id,
          status: report.status,
          openedByName: report.openedByName,
          openedAt: report.openedAt,
          closedAt: report.closedAt ?? null,
          openingFloatUsd: report.openingFloatUsd,
          openingFloatKhr: report.openingFloatKhr,
          totalSalesCashUsd: report.totalSalesCashUsd,
          totalSalesCashKhr: report.totalSalesCashKhr,
          totalPaidInUsd: report.totalPaidInUsd,
          totalPaidInKhr: report.totalPaidInKhr,
          totalPaidOutUsd: report.totalPaidOutUsd,
          totalPaidOutKhr: report.totalPaidOutKhr,
          expectedCashUsd: report.expectedCashUsd,
          expectedCashKhr: report.expectedCashKhr,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getZReportSummary(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId, branchId: userBranchId, role } = req.user || {};
      if (!tenantId || !role) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!adminOnlyRoles.has(role)) {
        return res
          .status(403)
          .json({ error: "Insufficient permissions" });
      }

      const query = ((req as any).validatedQuery ??
        req.query) as ZReportSummaryQuery;
      const { branchId } = resolveBranchId({
        queryBranchId: query.branchId,
        userBranchId,
        role,
      });

      if (!branchId) {
        return res.status(400).json({ error: "branchId is required" });
      }

      const branchExists = await assertBranchExists({
        req,
        tenantId,
        branchId,
      });
      if (!branchExists) {
        return res.status(404).json({ error: "Branch not found" });
      }

      const summary = await this.reportingService.getZReportSummary({
        tenantId,
        branchId,
        date: query.date,
      });

      return res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      next(error);
    }
  }

  async getZReportDetail(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId, employeeId, branchId: userBranchId, role } = req.user ||
        {};
      if (!tenantId || !employeeId || !role) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!adminOnlyRoles.has(role)) {
        return res
          .status(403)
          .json({ error: "Insufficient permissions" });
      }

      const query = ((req as any).validatedQuery ??
        req.query) as ReportDetailQuery;
      const { branchId, isForbidden } = resolveBranchId({
        queryBranchId: query.branchId,
        userBranchId,
        role,
      });

      if (!branchId) {
        return res.status(400).json({ error: "branchId is required" });
      }

      const branchExists = await assertBranchExists({
        req,
        tenantId,
        branchId,
      });
      if (!branchExists) {
        return res.status(404).json({ error: "Branch not found" });
      }

      const sessionId = req.params.sessionId;
      const report = await this.reportingService.getCashSessionReportDetail({
        tenantId,
        branchId,
        sessionId,
      });

      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      if (report.status === "OPEN") {
        return res
          .status(400)
          .json({ error: "Z report requires a closed session" });
      }

      return res.json({
        success: true,
        data: {
          id: report.id,
          status: report.status,
          openedByName: report.openedByName,
          openedAt: report.openedAt,
          closedAt: report.closedAt ?? null,
          openingFloatUsd: report.openingFloatUsd,
          openingFloatKhr: report.openingFloatKhr,
          totalSalesCashUsd: report.totalSalesCashUsd,
          totalSalesCashKhr: report.totalSalesCashKhr,
          totalPaidInUsd: report.totalPaidInUsd,
          totalPaidInKhr: report.totalPaidInKhr,
          totalPaidOutUsd: report.totalPaidOutUsd,
          totalPaidOutKhr: report.totalPaidOutKhr,
          expectedCashUsd: report.expectedCashUsd,
          expectedCashKhr: report.expectedCashKhr,
          countedCashUsd: report.countedCashUsd,
          countedCashKhr: report.countedCashKhr,
          varianceUsd: report.varianceUsd,
          varianceKhr: report.varianceKhr,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
