import type { RequestHandler } from "express";
import { pool } from "#db";
import type { AuditWriterPort } from "../../../shared/ports/audit.js";

type BranchGuardPortLike = {
  assertBranchActive(params: { tenantId: string; branchId: string }): Promise<void>;
};

type Queryable = {
  query: (text: string, params?: any[]) => Promise<any>;
};

type ResolveBranchId =
  | ((req: any) => string | undefined | Promise<string | undefined>)
  | undefined;

type RequireActiveBranchOptions = {
  resolveBranchId?: ResolveBranchId;
  operation?: string;
};

type AuditWriterPortLike = Pick<AuditWriterPort, "write">;

async function tryWriteFrozenBranchDenial(params: {
  db: Queryable;
  tenantId: string;
  branchId: string;
  employeeId?: string;
  actorRole?: string;
  operation?: string;
  method?: string;
  path?: string;
}): Promise<void> {
  try {
    await params.db.query(
      `INSERT INTO activity_log
        (tenant_id, branch_id, employee_id, action_type, resource_type, resource_id, outcome, denial_reason, actor_role, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        params.tenantId,
        params.branchId,
        params.employeeId ?? null,
        "ACTION_REJECTED_BRANCH_FROZEN",
        "BRANCH",
        params.branchId,
        "REJECTED",
        "BRANCH_FROZEN",
        params.actorRole ?? null,
        JSON.stringify({
          reason: "BRANCH_FROZEN",
          operation: params.operation ?? null,
          method: params.method ?? null,
          path: params.path ?? null,
        }),
      ]
    );
  } catch {
    // Best-effort only: do not block request handling if audit log write fails.
  }
}

async function tryWriteFrozenBranchDenialViaPort(params: {
  auditWriter: AuditWriterPortLike;
  tenantId: string;
  branchId: string;
  employeeId?: string;
  actorRole?: string;
  operation?: string;
  method?: string;
  path?: string;
}): Promise<void> {
  try {
    await params.auditWriter.write({
      tenantId: params.tenantId,
      branchId: params.branchId,
      employeeId: params.employeeId,
      actorRole: params.actorRole ?? null,
      actionType: "ACTION_REJECTED_BRANCH_FROZEN",
      resourceType: "BRANCH",
      resourceId: params.branchId,
      outcome: "REJECTED",
      denialReason: "BRANCH_FROZEN",
      details: {
        reason: "BRANCH_FROZEN",
        operation: params.operation ?? null,
        method: params.method ?? null,
        path: params.path ?? null,
      },
    });
  } catch {
    // Best-effort only: do not block request handling if audit log write fails.
  }
}

function isBranchFrozenError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === "object" && "code" in err && (err as any).code === "BRANCH_FROZEN") {
    return true;
  }
  if (err instanceof Error && err.message === "Branch is frozen") {
    return true;
  }
  return false;
}

export function requireActiveBranch(
  options?: RequireActiveBranchOptions
): RequestHandler {
  return async (req: any, res, next) => {
    let auditDb: Queryable = pool;
    let effectiveBranchId: string | null = null;
    try {
      const user = req.user;
      if (!user?.tenantId || !user?.branchId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const branchGuardPort: BranchGuardPortLike | undefined =
        req.app?.locals?.branchGuardPort;
      if (!branchGuardPort?.assertBranchActive) {
        throw new Error("Branch guard is not configured");
      }

      auditDb = req.app?.locals?.auditDb ?? pool;

      const resolvedBranchId =
        (await options?.resolveBranchId?.(req)) ?? undefined;
      const branchId =
        typeof resolvedBranchId === "string" && resolvedBranchId.length > 0
          ? resolvedBranchId
          : user.branchId;
      effectiveBranchId = branchId;

      await branchGuardPort.assertBranchActive({
        tenantId: user.tenantId,
        branchId,
      });

      next();
    } catch (err) {
      if (isBranchFrozenError(err)) {
        const user = req.user;
        if (user?.tenantId && effectiveBranchId) {
          const auditWriter: AuditWriterPortLike | undefined =
            req.app?.locals?.auditWriterPort;
          if (auditWriter?.write) {
            await tryWriteFrozenBranchDenialViaPort({
              auditWriter,
              tenantId: user.tenantId,
              branchId: effectiveBranchId,
              employeeId: user.employeeId,
              actorRole: user.role,
              operation: options?.operation,
              method: req.method,
              path: req.originalUrl,
            });
          } else {
            await tryWriteFrozenBranchDenial({
              db: auditDb,
              tenantId: user.tenantId,
              branchId: effectiveBranchId,
              employeeId: user.employeeId,
              actorRole: user.role,
              operation: options?.operation,
              method: req.method,
              path: req.originalUrl,
            });
          }
        }
        return res.status(403).json({ error: "Branch is frozen", code: "BRANCH_FROZEN" });
      }

      if (err instanceof Error && err.message === "Branch not found") {
        return res.status(404).json({ error: "Branch not found" });
      }

      next(err);
    }
  };
}
