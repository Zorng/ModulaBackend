import { Router, type Response } from "express";
import { requireV0Auth, type V0AuthRequest } from "../../auth/api/middleware.js";
import { V0AuditError, V0AuditService } from "../../audit/app/service.js";
import {
  V0_REPORTING_ACTION_KEYS,
  V0_REPORTING_AUDIT_EVENT_KEYS,
  buildReportViewedMetadata,
  type V0ReportingViewType,
} from "../app/command-contract.js";
import { V0ReportingError, V0ReportingService } from "../app/service.js";

export function createV0ReportingRouter(input: {
  service: V0ReportingService;
  auditService: V0AuditService;
}): Router {
  const router = Router();

  router.get("/sales/summary", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    await handleRead({
      req,
      res,
      actionKey: V0_REPORTING_ACTION_KEYS.salesSummary,
      reportType: "SALES_SUMMARY",
      handler: () =>
        input.service.getSalesSummary({
          actor: req.v0Auth!,
          query: toQueryObject(req.query),
        }),
    });
  });

  router.get("/sales/drill-down", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    await handleRead({
      req,
      res,
      actionKey: V0_REPORTING_ACTION_KEYS.salesDrillDown,
      reportType: "SALES_DRILL_DOWN",
      handler: () =>
        input.service.getSalesDrillDown({
          actor: req.v0Auth!,
          query: toQueryObject(req.query),
        }),
    });
  });

  router.get(
    "/restock-spend/summary",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await handleRead({
        req,
        res,
        actionKey: V0_REPORTING_ACTION_KEYS.restockSpendSummary,
        reportType: "RESTOCK_SPEND_SUMMARY",
        handler: () =>
          input.service.getRestockSpendSummary({
            actor: req.v0Auth!,
            query: toQueryObject(req.query),
          }),
      });
    }
  );

  router.get(
    "/restock-spend/drill-down",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await handleRead({
        req,
        res,
        actionKey: V0_REPORTING_ACTION_KEYS.restockSpendDrillDown,
        reportType: "RESTOCK_SPEND_DRILL_DOWN",
        handler: () =>
          input.service.getRestockSpendDrillDown({
            actor: req.v0Auth!,
            query: toQueryObject(req.query),
          }),
      });
    }
  );

  router.get("/attendance/summary", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    await handleRead({
      req,
      res,
      actionKey: V0_REPORTING_ACTION_KEYS.attendanceSummary,
      reportType: "ATTENDANCE_SUMMARY",
      handler: () =>
        input.service.getAttendanceSummary({
          actor: req.v0Auth!,
          query: toQueryObject(req.query),
        }),
    });
  });

  router.get(
    "/attendance/drill-down",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await handleRead({
        req,
        res,
        actionKey: V0_REPORTING_ACTION_KEYS.attendanceDrillDown,
        reportType: "ATTENDANCE_DRILL_DOWN",
        handler: () =>
          input.service.getAttendanceDrillDown({
            actor: req.v0Auth!,
            query: toQueryObject(req.query),
          }),
      });
    }
  );

  return router;

  async function handleRead(inputRead: {
    req: V0AuthRequest;
    res: Response;
    actionKey: string;
    reportType: V0ReportingViewType;
    handler: () => Promise<unknown>;
  }): Promise<void> {
    try {
      const actor = inputRead.req.v0Auth;
      if (!actor) {
        inputRead.res.status(401).json({
          success: false,
          error: "authentication required",
        });
        return;
      }

      const data = await inputRead.handler();
      await recordReportViewedAudit({
        actor,
        actionKey: inputRead.actionKey,
        reportType: inputRead.reportType,
        data,
      });

      inputRead.res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      handleError(inputRead.res, error);
    }
  }

  async function recordReportViewedAudit(inputAudit: {
    actor: NonNullable<V0AuthRequest["v0Auth"]>;
    actionKey: string;
    reportType: V0ReportingViewType;
    data: unknown;
  }): Promise<void> {
    const scope = extractScopeMetadata(inputAudit.data);
    if (!scope) {
      return;
    }

    try {
      await input.auditService.recordEvent({
        tenantId: scope.tenantId,
        branchId: scope.branchId ?? inputAudit.actor.branchId ?? null,
        actorAccountId: inputAudit.actor.accountId,
        actionKey: V0_REPORTING_AUDIT_EVENT_KEYS.reportViewed,
        outcome: "SUCCESS",
        reasonCode: null,
        entityType: "report",
        entityId: inputAudit.reportType.toLowerCase(),
        dedupeKey: null,
        metadata: {
          actionKey: inputAudit.actionKey,
          ...buildReportViewedMetadata({
            reportType: inputAudit.reportType,
            branchScope: scope.branchScope,
            branchId: scope.branchId,
            from: scope.from,
            to: scope.to,
            timezone: scope.timezone,
            filters: {},
          }),
        },
      });
    } catch {}
  }
}

function toQueryObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function extractScopeMetadata(input: unknown): {
  tenantId: string;
  branchScope: "BRANCH" | "ALL_BRANCHES";
  branchId: string | null;
  from: string;
  to: string;
  timezone: string | null;
} | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const data = input as Record<string, unknown>;
  const scope = data.scope;
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) {
    return null;
  }
  const scopeMap = scope as Record<string, unknown>;
  const tenantId = String(scopeMap.tenantId ?? "").trim();
  const branchScopeRaw = String(scopeMap.branchScope ?? "").trim().toUpperCase();
  const from = String(scopeMap.from ?? "").trim();
  const to = String(scopeMap.to ?? "").trim();
  if (!tenantId || !from || !to) {
    return null;
  }
  if (branchScopeRaw !== "BRANCH" && branchScopeRaw !== "ALL_BRANCHES") {
    return null;
  }
  const branchIdRaw = String(scopeMap.branchId ?? "").trim();
  return {
    tenantId,
    branchScope: branchScopeRaw,
    branchId: branchIdRaw ? branchIdRaw : null,
    from,
    to,
    timezone: String(scopeMap.timezone ?? "").trim() || null,
  };
}

function handleError(res: Response, error: unknown): void {
  if (error instanceof V0ReportingError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
      details: error.details,
    });
    return;
  }

  if (error instanceof V0AuditError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: error instanceof Error ? error.message : "internal server error",
  });
}
