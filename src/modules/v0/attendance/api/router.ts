import type { Pool } from "pg";
import { Router, type Response } from "express";
import { requireV0Auth, type V0AuthRequest } from "../../auth/api/middleware.js";
import { V0AttendanceError, V0AttendanceService } from "../app/service.js";
import { V0AttendanceRepository } from "../infra/repository.js";
import {
  getIdempotencyKeyFromHeader,
  V0IdempotencyError,
  V0IdempotencyService,
} from "../../../../platform/idempotency/service.js";
import { V0AuditService } from "../../audit/app/service.js";
import { V0AuditRepository } from "../../audit/infra/repository.js";
import { TransactionManager } from "../../../../platform/db/transactionManager.js";
import { V0CommandOutboxRepository } from "../../../../platform/outbox/repository.js";
import { buildCommandDedupeKey } from "../../../../shared/utils/dedupe.js";

type AttendanceWriteBody =
  | {
      success: true;
      data: {
        id: string;
        tenantId: string;
        branchId: string;
        accountId: string;
        type: "CHECK_IN" | "CHECK_OUT";
        occurredAt: string;
        createdAt: string;
      };
    }
  | {
      success: false;
      error: string;
    };

export function createV0AttendanceRouter(
  service: V0AttendanceService,
  idempotencyService: V0IdempotencyService,
  db: Pool
): Router {
  const router = Router();
  const transactionManager = new TransactionManager(db);

  router.post("/check-in", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    const actor = req.v0Auth;
    const actionKey = "attendance.checkIn";
    const idempotencyKey = getIdempotencyKeyFromHeader(req.headers);

    try {
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }
      const tenantId = String(actor.tenantId ?? "").trim();
      const branchId = String(actor.branchId ?? "").trim();
      if (!tenantId || !branchId) {
        res.status(403).json({ success: false, error: "branch context required" });
        return;
      }

      const result = await idempotencyService.execute<AttendanceWriteBody>({
        idempotencyKey,
        actionKey,
        scope: "BRANCH",
        tenantId,
        branchId,
        payload: req.body,
        handler: async () => {
          const txResult = await transactionManager.withTransaction(async (client) => {
            const txService = new V0AttendanceService(new V0AttendanceRepository(client));
            const txAuditService = new V0AuditService(new V0AuditRepository(client));
            const txOutboxRepository = new V0CommandOutboxRepository(client);
            try {
              const commandData = await txService.checkIn({
                actor,
                occurredAt: req.body?.occurredAt,
              });

              const dedupeKey = buildAuditDedupeKey({
                actionKey,
                idempotencyKey,
                outcome: "SUCCESS",
              });

              await txAuditService.recordEvent({
                tenantId,
                branchId,
                actorAccountId: actor.accountId,
                actionKey,
                outcome: "SUCCESS",
                reasonCode: null,
                entityType: "attendance_record",
                entityId: commandData.id,
                dedupeKey,
                metadata: {
                  replayed: false,
                  endpoint: "/v0/attendance/check-in",
                },
              });
              await txOutboxRepository.insertEvent({
                tenantId,
                branchId,
                actionKey,
                eventType: "ATTENDANCE_CHECKED_IN",
                actorType: "ACCOUNT",
                actorId: actor.accountId,
                entityType: "attendance_record",
                entityId: commandData.id,
                outcome: "SUCCESS",
                dedupeKey,
                payload: {
                  endpoint: "/v0/attendance/check-in",
                  replayed: false,
                },
              });

              return { status: "SUCCESS" as const, data: commandData };
            } catch (error) {
              if (error instanceof V0AttendanceError) {
                const reasonCode = classifyReasonCode(error);
                const dedupeKey = buildAuditDedupeKey({
                  actionKey,
                  idempotencyKey,
                  outcome: "REJECTED",
                });

                await txAuditService.recordEvent({
                  tenantId,
                  branchId,
                  actorAccountId: actor.accountId,
                  actionKey,
                  outcome: "REJECTED",
                  reasonCode,
                  entityType: "attendance_record",
                  entityId: actor.accountId,
                  dedupeKey,
                  metadata: {
                    replayed: false,
                    endpoint: "/v0/attendance/check-in",
                  },
                });
                await txOutboxRepository.insertEvent({
                  tenantId,
                  branchId,
                  actionKey,
                  eventType: "ATTENDANCE_CHECKIN_REJECTED",
                  actorType: "ACCOUNT",
                  actorId: actor.accountId,
                  entityType: "attendance_record",
                  entityId: actor.accountId,
                  outcome: "REJECTED",
                  reasonCode,
                  dedupeKey,
                  payload: {
                    endpoint: "/v0/attendance/check-in",
                  },
                });
                return { status: "REJECTED" as const, error };
              }
              throw error;
            }
          });
          if (txResult.status === "REJECTED") {
            return {
              statusCode: txResult.error.statusCode,
              body: {
                success: false,
                error: txResult.error.message,
              },
            };
          }
          return {
            statusCode: 201,
            body: { success: true, data: txResult.data },
          };
        },
      });

      if (result.replayed) {
        res.setHeader("Idempotency-Replayed", "true");
      }
      res.status(result.statusCode).json(result.body);
    } catch (error) {
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
      const tenantId = String(actor.tenantId ?? "").trim();
      const branchId = String(actor.branchId ?? "").trim();
      if (!tenantId || !branchId) {
        res.status(403).json({ success: false, error: "branch context required" });
        return;
      }

      const result = await idempotencyService.execute<AttendanceWriteBody>({
        idempotencyKey,
        actionKey,
        scope: "BRANCH",
        tenantId,
        branchId,
        payload: req.body,
        handler: async () => {
          const txResult = await transactionManager.withTransaction(async (client) => {
            const txService = new V0AttendanceService(new V0AttendanceRepository(client));
            const txAuditService = new V0AuditService(new V0AuditRepository(client));
            const txOutboxRepository = new V0CommandOutboxRepository(client);
            try {
              const commandData = await txService.checkOut({
                actor,
                occurredAt: req.body?.occurredAt,
              });

              const dedupeKey = buildAuditDedupeKey({
                actionKey,
                idempotencyKey,
                outcome: "SUCCESS",
              });

              await txAuditService.recordEvent({
                tenantId,
                branchId,
                actorAccountId: actor.accountId,
                actionKey,
                outcome: "SUCCESS",
                reasonCode: null,
                entityType: "attendance_record",
                entityId: commandData.id,
                dedupeKey,
                metadata: {
                  replayed: false,
                  endpoint: "/v0/attendance/check-out",
                },
              });
              await txOutboxRepository.insertEvent({
                tenantId,
                branchId,
                actionKey,
                eventType: "ATTENDANCE_CHECKED_OUT",
                actorType: "ACCOUNT",
                actorId: actor.accountId,
                entityType: "attendance_record",
                entityId: commandData.id,
                outcome: "SUCCESS",
                dedupeKey,
                payload: {
                  endpoint: "/v0/attendance/check-out",
                  replayed: false,
                },
              });

              return { status: "SUCCESS" as const, data: commandData };
            } catch (error) {
              if (error instanceof V0AttendanceError) {
                const reasonCode = classifyReasonCode(error);
                const dedupeKey = buildAuditDedupeKey({
                  actionKey,
                  idempotencyKey,
                  outcome: "REJECTED",
                });

                await txAuditService.recordEvent({
                  tenantId,
                  branchId,
                  actorAccountId: actor.accountId,
                  actionKey,
                  outcome: "REJECTED",
                  reasonCode,
                  entityType: "attendance_record",
                  entityId: actor.accountId,
                  dedupeKey,
                  metadata: {
                    replayed: false,
                    endpoint: "/v0/attendance/check-out",
                  },
                });
                await txOutboxRepository.insertEvent({
                  tenantId,
                  branchId,
                  actionKey,
                  eventType: "ATTENDANCE_CHECKOUT_REJECTED",
                  actorType: "ACCOUNT",
                  actorId: actor.accountId,
                  entityType: "attendance_record",
                  entityId: actor.accountId,
                  outcome: "REJECTED",
                  reasonCode,
                  dedupeKey,
                  payload: {
                    endpoint: "/v0/attendance/check-out",
                  },
                });
                return { status: "REJECTED" as const, error };
              }
              throw error;
            }
          });
          if (txResult.status === "REJECTED") {
            return {
              statusCode: txResult.error.statusCode,
              body: {
                success: false,
                error: txResult.error.message,
              },
            };
          }
          return {
            statusCode: 201,
            body: { success: true, data: txResult.data },
          };
        },
      });

      if (result.replayed) {
        res.setHeader("Idempotency-Replayed", "true");
      }
      res.status(result.statusCode).json(result.body);
    } catch (error) {
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

function buildAuditDedupeKey(input: {
  actionKey: string;
  idempotencyKey: string | null;
  outcome: "SUCCESS" | "REJECTED" | "FAILED";
}): string | null {
  return buildCommandDedupeKey({
    actionKey: input.actionKey,
    idempotencyKey: input.idempotencyKey,
    outcome: input.outcome,
  });
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
