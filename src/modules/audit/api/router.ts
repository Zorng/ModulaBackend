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
   * /v1/audit/ingest:
   *   post:
   *     tags:
   *       - Audit
   *     summary: Ingest offline audit events (authenticated)
   *     description: |
   *       Accepts client-generated audit events for offline operation and persists them idempotently using `client_event_id`.
   *       Tenant/branch/actor context is derived from the authenticated user.
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: "#/components/schemas/AuditOfflineIngestRequest"
   *     responses:
   *       200:
   *         description: Ingestion result
   *         content:
   *           application/json:
   *             schema:
   *               $ref: "#/components/schemas/AuditOfflineIngestResponse"
   *       401:
   *         description: Authentication required
   *       422:
   *         description: Validation error
   */
  router.post(
    "/ingest",
    async (req: any, res: Response, next: NextFunction) => {
      try {
        const tenantId = req.user?.tenantId;
        const branchId = req.user?.branchId;
        const employeeId = req.user?.employeeId;
        const actorRole = req.user?.role;
        if (!tenantId || !branchId || !employeeId || !actorRole) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const body = req.body as any;
        const rawEvents = Array.isArray(body?.events) ? body.events : null;
        if (!rawEvents || rawEvents.length === 0) {
          return res.status(422).json({ error: "events must be a non-empty array" });
        }
        if (rawEvents.length > 100) {
          return res.status(422).json({ error: "events cannot exceed 100 per request" });
        }

        const events = rawEvents.map((e: any) => {
          if (!e || typeof e !== "object") {
            throw new Error("each event must be an object");
          }

          const clientEventId =
            typeof e.client_event_id === "string" ? e.client_event_id : "";
          const actionType = typeof e.action_type === "string" ? e.action_type : "";

          let occurredAt: Date;
          try {
            const parsed = parseOptionalDate(e.occurred_at);
            if (!parsed) {
              throw new Error("occurred_at is required");
            }
            occurredAt = parsed;
          } catch {
            throw new Error("occurred_at must be a valid ISO date-time string");
          }

          let outcome: AuditOutcome | undefined;
          if (typeof e.outcome === "string") {
            if (!OUTCOMES.includes(e.outcome as AuditOutcome)) {
              throw new Error(`outcome must be one of: ${OUTCOMES.join(", ")}`);
            }
            outcome = e.outcome as AuditOutcome;
          }

          let denialReason: AuditDenialReason | undefined;
          if (typeof e.denial_reason === "string") {
            if (!DENIAL_REASONS.includes(e.denial_reason as AuditDenialReason)) {
              throw new Error(
                `denial_reason must be one of: ${DENIAL_REASONS.join(", ")}`
              );
            }
            denialReason = e.denial_reason as AuditDenialReason;
          }

          if (denialReason && outcome !== "REJECTED") {
            throw new Error("denial_reason is only allowed when outcome=REJECTED");
          }

          const details =
            e.details == null
              ? undefined
              : typeof e.details === "object" && !Array.isArray(e.details)
                ? (e.details as Record<string, any>)
                : (() => {
                    throw new Error("details must be an object");
                  })();

          return {
            clientEventId,
            occurredAt,
            actionType,
            resourceType: typeof e.resource_type === "string" ? e.resource_type : undefined,
            resourceId: typeof e.resource_id === "string" ? e.resource_id : undefined,
            outcome,
            denialReason,
            details,
          };
        });

        const result = await auditService.ingestOfflineEvents({
          tenantId,
          branchId,
          employeeId,
          actorRole,
          events,
          ipAddress: req.ip || req.socket?.remoteAddress,
          userAgent: req.headers["user-agent"] as string | undefined,
        });

        return res.json(result);
      } catch (err) {
        if (err instanceof Error) {
          const message = err.message || "Validation error";
          if (
            message.includes("events") ||
            message.includes("client_event_id") ||
            message.includes("occurred_at") ||
            message.includes("action_type") ||
            message.includes("resource_type") ||
            message.includes("resource_id") ||
            message.includes("outcome") ||
            message.includes("denial_reason") ||
            message.includes("details")
          ) {
            return res.status(422).json({ error: message });
          }
        }
        next(err);
      }
    }
  );

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
