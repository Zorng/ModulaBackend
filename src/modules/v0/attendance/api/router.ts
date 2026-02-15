import { Router, type Response } from "express";
import { requireV0Auth, type V0AuthRequest } from "../../auth/api/middleware.js";
import { V0AttendanceError, V0AttendanceService } from "../app/service.js";
import {
  getIdempotencyKeyFromHeader,
  V0IdempotencyError,
  V0IdempotencyService,
} from "../../../../platform/idempotency/service.js";
import { V0AuditService } from "../../audit/app/service.js";

export function createV0AttendanceRouter(
  service: V0AttendanceService,
  idempotencyService: V0IdempotencyService,
  auditService: V0AuditService
): Router {
  const router = Router();

  router.post("/check-in", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    const actor = req.v0Auth;
    const actionKey = "attendance.checkIn";
    const idempotencyKey = getIdempotencyKeyFromHeader(req.headers);

    try {
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const result = await idempotencyService.execute({
        idempotencyKey,
        actionKey,
        scope: "BRANCH",
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        payload: req.body,
        handler: async () => {
          const data = await service.checkIn({
            actor,
            occurredAt: req.body?.occurredAt,
          });
          return {
            statusCode: 201,
            body: { success: true, data },
          };
        },
      });

      await writeAttendanceAuditEvent(auditService, {
        actor,
        actionKey,
        outcome: "SUCCESS",
        reasonCode: null,
        entityType: "attendance_record",
        entityId: readEntityId(result.body),
        idempotencyKey,
        metadata: {
          replayed: result.replayed,
          endpoint: "/v0/attendance/check-in",
        },
      });

      if (result.replayed) {
        res.setHeader("Idempotency-Replayed", "true");
      }
      res.status(result.statusCode).json(result.body);
    } catch (error) {
      await writeAttendanceAuditEvent(auditService, {
        actor,
        actionKey,
        outcome: classifyAuditOutcome(error),
        reasonCode: classifyReasonCode(error),
        entityType: "attendance_record",
        entityId: null,
        idempotencyKey,
        metadata: {
          endpoint: "/v0/attendance/check-in",
          error:
            error instanceof Error
              ? {
                  name: error.name,
                  message: error.message,
                }
              : { message: "unknown error" },
        },
      });
      handleError(res, error);
    }
  });

  router.post("/check-out", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    const actor = req.v0Auth;
    const actionKey = "attendance.checkOut";
    const idempotencyKey = getIdempotencyKeyFromHeader(req.headers);

    try {
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const result = await idempotencyService.execute({
        idempotencyKey,
        actionKey,
        scope: "BRANCH",
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        payload: req.body,
        handler: async () => {
          const data = await service.checkOut({
            actor,
            occurredAt: req.body?.occurredAt,
          });
          return {
            statusCode: 201,
            body: { success: true, data },
          };
        },
      });

      await writeAttendanceAuditEvent(auditService, {
        actor,
        actionKey,
        outcome: "SUCCESS",
        reasonCode: null,
        entityType: "attendance_record",
        entityId: readEntityId(result.body),
        idempotencyKey,
        metadata: {
          replayed: result.replayed,
          endpoint: "/v0/attendance/check-out",
        },
      });

      if (result.replayed) {
        res.setHeader("Idempotency-Replayed", "true");
      }
      res.status(result.statusCode).json(result.body);
    } catch (error) {
      await writeAttendanceAuditEvent(auditService, {
        actor,
        actionKey,
        outcome: classifyAuditOutcome(error),
        reasonCode: classifyReasonCode(error),
        entityType: "attendance_record",
        entityId: null,
        idempotencyKey,
        metadata: {
          endpoint: "/v0/attendance/check-out",
          error:
            error instanceof Error
              ? {
                  name: error.name,
                  message: error.message,
                }
              : { message: "unknown error" },
        },
      });
      handleError(res, error);
    }
  });

  router.get("/me", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await service.listMine({
        actor,
        limit: Number(req.query?.limit ?? 50),
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;
}

async function writeAttendanceAuditEvent(
  auditService: V0AuditService,
  input: {
    actor: V0AuthRequest["v0Auth"] | undefined;
    actionKey: string;
    outcome: "SUCCESS" | "REJECTED" | "FAILED";
    reasonCode: string | null;
    entityType: string;
    entityId: string | null;
    idempotencyKey: string | null;
    metadata: Record<string, unknown>;
  }
): Promise<void> {
  const actor = input.actor;
  if (!actor) {
    return;
  }

  const tenantId = String(actor.tenantId ?? "").trim();
  if (!tenantId) {
    return;
  }

  try {
    await auditService.recordEvent({
      tenantId,
      branchId: actor.branchId,
      actorAccountId: actor.accountId,
      actionKey: input.actionKey,
      outcome: input.outcome,
      reasonCode: input.reasonCode,
      entityType: input.entityType,
      entityId: input.entityId,
      dedupeKey: buildAuditDedupeKey({
        actionKey: input.actionKey,
        idempotencyKey: input.idempotencyKey,
        outcome: input.outcome,
      }),
      metadata: input.metadata,
    });
  } catch {
    // Audit write failures are non-blocking for attendance writes.
  }
}

function buildAuditDedupeKey(input: {
  actionKey: string;
  idempotencyKey: string | null;
  outcome: "SUCCESS" | "REJECTED" | "FAILED";
}): string | null {
  const key = String(input.idempotencyKey ?? "").trim();
  if (!key) {
    return null;
  }
  return `${input.actionKey}:${input.outcome}:${key}`;
}

function readEntityId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const data = (body as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) {
    return null;
  }

  const id = (data as { id?: unknown }).id;
  return typeof id === "string" && id.trim() ? id : null;
}

function classifyAuditOutcome(error: unknown): "REJECTED" | "FAILED" {
  if (error instanceof V0IdempotencyError || error instanceof V0AttendanceError) {
    if (error.statusCode >= 500) {
      return "FAILED";
    }
    return "REJECTED";
  }

  return "FAILED";
}

function classifyReasonCode(error: unknown): string | null {
  if (error instanceof V0IdempotencyError) {
    return error.code;
  }

  if (error instanceof V0AttendanceError) {
    switch (error.message) {
      case "already checked in":
        return "ALREADY_CHECKED_IN";
      case "no active check-in":
        return "NO_ACTIVE_CHECK_IN";
      case "occurredAt must be a valid ISO timestamp":
        return "INVALID_OCCURRED_AT";
      case "tenant context required":
        return "TENANT_CONTEXT_REQUIRED";
      case "branch context required":
        return "BRANCH_CONTEXT_REQUIRED";
      default:
        return "ATTENDANCE_REJECTED";
    }
  }

  return "ATTENDANCE_FAILED";
}

function handleError(res: Response, error: unknown): void {
  if (error instanceof V0IdempotencyError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.code,
      code: error.code,
    });
    return;
  }

  if (error instanceof V0AttendanceError) {
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
