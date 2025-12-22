import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { AuthMiddlewarePort } from "../../../platform/security/auth.js";
import type { AuditDenialReason, AuditOutcome } from "../domain/entities.js";
import type { AuditService } from "../app/audit.service.js";

function requireRole(auth: AuthMiddlewarePort, roles: string[]) {
  if (!auth.requireRole) {
    throw new Error("AuthMiddlewarePort.requireRole is required for this route");
  }
  return auth.requireRole(roles);
}

const OUTCOMES: AuditOutcome[] = ["SUCCESS", "REJECTED", "FAILED"];
const DENIAL_REASONS: AuditDenialReason[] = [
  "PERMISSION_DENIED",
  "POLICY_BLOCKED",
  "VALIDATION_FAILED",
  "BRANCH_FROZEN",
  "TENANT_FROZEN",
  "DEPENDENCY_MISSING",
];

function parseOptionalDate(value: unknown): Date | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) {
    throw new Error("invalid date");
  }
  return dt;
}

export function createAuditRouter(
  auditService: AuditService,
  authMiddleware: AuthMiddlewarePort
): Router {
  const router = Router();

  router.use(authMiddleware.authenticate);

  /**
   * @openapi
   * /v1/audit/logs:
   *   get:
   *     tags:
   *       - Audit
   *     summary: List audit logs (Admin only)
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: query
   *         name: from
   *         schema:
   *           type: string
   *           format: date-time
   *         description: Filter logs with occurred_at >= from
   *       - in: query
   *         name: to
   *         schema:
   *           type: string
   *           format: date-time
   *         description: Filter logs with occurred_at <= to
   *       - in: query
   *         name: branch_id
   *         schema:
   *           type: string
   *           format: uuid
   *       - in: query
   *         name: employee_id
   *         schema:
   *           type: string
   *           format: uuid
   *       - in: query
   *         name: action_type
   *         schema:
   *           type: string
   *       - in: query
   *         name: outcome
   *         schema:
   *           $ref: "#/components/schemas/AuditOutcome"
   *       - in: query
   *         name: denial_reason
   *         schema:
   *           $ref: "#/components/schemas/AuditDenialReason"
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           minimum: 1
   *           default: 1
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *           default: 50
   *     responses:
   *       200:
   *         description: Audit logs
   *         content:
   *           application/json:
   *             schema:
   *               $ref: "#/components/schemas/AuditLogListResponse"
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Admin role required
   *       422:
   *         description: Validation error
   */
  // Admin-only: list audit logs
  router.get(
    "/logs",
    requireRole(authMiddleware, ["ADMIN"]),
    async (req: any, res: Response, next: NextFunction) => {
      try {
        const tenantId = req.user?.tenantId;
        if (!tenantId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const page = req.query.page ? Number(req.query.page) : undefined;
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        if (page !== undefined && (!Number.isInteger(page) || page < 1)) {
          return res.status(422).json({ error: "page must be a positive integer" });
        }
        if (
          limit !== undefined &&
          (!Number.isInteger(limit) || limit < 1 || limit > 100)
        ) {
          return res
            .status(422)
            .json({ error: "limit must be an integer between 1 and 100" });
        }

        let outcome: AuditOutcome | undefined;
        if (typeof req.query.outcome === "string") {
          if (!OUTCOMES.includes(req.query.outcome as AuditOutcome)) {
            return res
              .status(422)
              .json({ error: `outcome must be one of: ${OUTCOMES.join(", ")}` });
          }
          outcome = req.query.outcome as AuditOutcome;
        }

        let denialReason: AuditDenialReason | undefined;
        if (typeof req.query.denial_reason === "string") {
          if (!DENIAL_REASONS.includes(req.query.denial_reason as AuditDenialReason)) {
            return res.status(422).json({
              error: `denial_reason must be one of: ${DENIAL_REASONS.join(", ")}`,
            });
          }
          denialReason = req.query.denial_reason as AuditDenialReason;
        }

        let from: Date | undefined;
        let to: Date | undefined;
        try {
          from = parseOptionalDate(req.query.from);
          to = parseOptionalDate(req.query.to);
        } catch {
          return res
            .status(422)
            .json({ error: "from/to must be valid ISO date-time strings" });
        }

        const branchId =
          typeof req.query.branch_id === "string" ? req.query.branch_id : undefined;
        const employeeId =
          typeof req.query.employee_id === "string"
            ? req.query.employee_id
            : undefined;
        const actionType =
          typeof req.query.action_type === "string"
            ? req.query.action_type
            : undefined;

        const result = await auditService.listLogs({
          tenantId,
          from,
          to,
          branchId,
          employeeId,
          actionType,
          outcome,
          denialReason,
          page,
          limit,
        });

        return res.json({
          logs: result.logs,
          page: result.page,
          limit: result.limit,
          total: result.total,
        });
      } catch (err) {
        if (err instanceof Error) {
          if (
            err.message.includes("page must be") ||
            err.message.includes("limit must be")
          ) {
            return res.status(422).json({ error: err.message });
          }
        }
        next(err);
      }
    }
  );

  /**
   * @openapi
   * /v1/audit/logs/{id}:
   *   get:
   *     tags:
   *       - Audit
   *     summary: Get audit log entry (Admin only)
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Audit log entry
   *         content:
   *           application/json:
   *             schema:
   *               $ref: "#/components/schemas/AuditLogResponse"
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Admin role required
   *       404:
   *         description: Audit log not found
   *       422:
   *         description: Validation error
   */
  // Admin-only: fetch a single log entry
  router.get(
    "/logs/:id",
    requireRole(authMiddleware, ["ADMIN"]),
    async (req: any, res: Response, next: NextFunction) => {
      try {
        const tenantId = req.user?.tenantId;
        if (!tenantId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const id = req.params.id;
        if (!id) {
          return res.status(422).json({ error: "id is required" });
        }

        const log = await auditService.getLog({ tenantId, id });
        return res.json({ log });
      } catch (err) {
        if (err instanceof Error && err.message === "Audit log not found") {
          return res.status(404).json({ error: err.message });
        }
        next(err);
      }
    }
  );

  return router;
}
