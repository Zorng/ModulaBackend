import type { Request, Response, NextFunction } from "express";
import type { Pool } from "pg";
import type { AuthRequest } from "../../../../platform/security/auth.js";

type GateMode = "always" | "only_if_creating_draft";

async function readCashRequireSessionForSales(params: {
  pool: Pool;
  tenantId: string;
  branchId: string;
}): Promise<boolean> {
  const projected = await params.pool.query(
    `SELECT cash_require_session_for_sales
     FROM branch_policies
     WHERE tenant_id = $1 AND branch_id = $2`,
    [params.tenantId, params.branchId]
  );

  if (projected.rows.length > 0) {
    return Boolean(projected.rows[0].cash_require_session_for_sales);
  }

  const fallback = await params.pool.query(
    `SELECT require_session_for_sales
     FROM branch_cash_session_policies
     WHERE tenant_id = $1 AND branch_id = $2`,
    [params.tenantId, params.branchId]
  );

  if (fallback.rows.length > 0) {
    return Boolean(fallback.rows[0].require_session_for_sales);
  }

  return false;
}

async function hasOpenCashSessionForUser(params: {
  pool: Pool;
  tenantId: string;
  branchId: string;
  openedBy: string;
}): Promise<boolean> {
  const res = await params.pool.query(
    `SELECT 1
     FROM cash_sessions
     WHERE tenant_id = $1 AND branch_id = $2 AND opened_by = $3 AND status = 'OPEN'
     LIMIT 1`,
    [params.tenantId, params.branchId, params.openedBy]
  );
  return res.rows.length > 0;
}

async function hasExistingDraftForClientUuid(params: {
  pool: Pool;
  tenantId: string;
  branchId: string;
  clientUuid: string;
}): Promise<boolean> {
  const res = await params.pool.query(
    `SELECT 1
     FROM sales
     WHERE tenant_id = $1
       AND branch_id = $2
       AND client_uuid = $3
       AND state = 'draft'
     LIMIT 1`,
    [params.tenantId, params.branchId, params.clientUuid]
  );
  return res.rows.length > 0;
}

export function createRequireCashSessionForSalesMiddleware(
  pool: Pool,
  options?: { mode?: GateMode }
) {
  const mode: GateMode = options?.mode ?? "always";

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.user?.tenantId;
      const branchId = authReq.user?.branchId;

      if (!tenantId || !branchId) {
        return res.status(403).json({
          success: false,
          error: "User must be assigned to a branch to access sales",
        });
      }

      const required = await readCashRequireSessionForSales({
        pool,
        tenantId,
        branchId,
      });
      if (!required) {
        return next();
      }

      if (mode === "only_if_creating_draft") {
        const clientUuid = req.params.clientUuid;
        if (typeof clientUuid === "string" && clientUuid.length > 0) {
          const draftExists = await hasExistingDraftForClientUuid({
            pool,
            tenantId,
            branchId,
            clientUuid,
          });
          if (draftExists) {
            return next();
          }
        }
      }

      const hasOpenSession = await hasOpenCashSessionForUser({
        pool,
        tenantId,
        branchId,
        openedBy: authReq.user.employeeId,
      });
      if (!hasOpenSession) {
        return res.status(409).json({
          success: false,
          code: "CASH_SESSION_REQUIRED",
          error: "Active cash session required to start or modify a cart",
        });
      }

      return next();
    } catch (error) {
      console.error("[Sales] Cash-session gating middleware failed:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  };
}
