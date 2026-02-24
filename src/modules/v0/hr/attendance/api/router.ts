import type { Pool } from "pg";
import { Router, type Response } from "express";
import { requireV0Auth, type V0AuthRequest } from "../../../auth/api/middleware.js";
import { V0AttendanceError, V0AttendanceService } from "../app/service.js";
import { V0AttendanceRepository } from "../infra/repository.js";
import {
  getIdempotencyKeyFromHeader,
  V0IdempotencyError,
  V0IdempotencyService,
} from "../../../../../platform/idempotency/service.js";
import { V0AuditService } from "../../../audit/app/service.js";
import { V0AuditRepository } from "../../../audit/infra/repository.js";
import { TransactionManager } from "../../../../../platform/db/transactionManager.js";
import { V0CommandOutboxRepository } from "../../../../../platform/outbox/repository.js";
import { buildCommandDedupeKey } from "../../../../../shared/utils/dedupe.js";
import { V0PullSyncRepository } from "../../../platformSystem/pullSync/infra/repository.js";

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
        locationVerification: {
          observedLatitude: number | null;
          observedLongitude: number | null;
          observedAccuracyMeters: number | null;
          capturedAt: string | null;
          status: "MATCH" | "MISMATCH" | "UNKNOWN" | null;
          reason: string | null;
          distanceMeters: number | null;
        } | null;
        forceEndedByAccountId: string | null;
        forceEndReason: string | null;
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
            const txSyncRepository = new V0PullSyncRepository(client);
            try {
              const commandData = await txService.checkIn({
                actor,
                occurredAt: req.body?.occurredAt,
                location: req.body?.location,
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
              const outbox = await txOutboxRepository.insertEvent({
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

              if (outbox.inserted && outbox.row) {
                await txSyncRepository.appendChange({
                  tenantId,
                  branchId,
                  accountId: actor.accountId,
                  moduleKey: "attendance",
                  entityType: "attendance_record",
                  entityId: commandData.id,
                  operation: "UPSERT",
                  revision: `attendance:${outbox.row.id}`,
                  data: commandData,
                  changedAt: outbox.row.occurred_at,
                  sourceOutboxId: outbox.row.id,
                });
              }

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
            const txSyncRepository = new V0PullSyncRepository(client);
            try {
              const commandData = await txService.checkOut({
                actor,
                occurredAt: req.body?.occurredAt,
                location: req.body?.location,
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
              const outbox = await txOutboxRepository.insertEvent({
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

              if (outbox.inserted && outbox.row) {
                await txSyncRepository.appendChange({
                  tenantId,
                  branchId,
                  accountId: actor.accountId,
                  moduleKey: "attendance",
                  entityType: "attendance_record",
                  entityId: commandData.id,
                  operation: "UPSERT",
                  revision: `attendance:${outbox.row.id}`,
                  data: commandData,
                  changedAt: outbox.row.occurred_at,
                  sourceOutboxId: outbox.row.id,
                });
              }

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

  router.post("/force-end", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    const actor = req.v0Auth;
    const actionKey = "attendance.forceEnd";
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

      const targetAccountId = String(req.body?.targetAccountId ?? "").trim() || actor.accountId;
      const forceEndReason = String(req.body?.reason ?? "").trim() || null;

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
            const txSyncRepository = new V0PullSyncRepository(client);
            try {
              const commandData = await txService.forceEndWork({
                actor,
                targetAccountId: req.body?.targetAccountId,
                reason: req.body?.reason,
                occurredAt: req.body?.occurredAt,
                location: req.body?.location,
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
                  endpoint: "/v0/attendance/force-end",
                  targetAccountId,
                  forceEndReason,
                },
              });
              const outbox = await txOutboxRepository.insertEvent({
                tenantId,
                branchId,
                actionKey,
                eventType: "ATTENDANCE_FORCE_ENDED",
                actorType: "ACCOUNT",
                actorId: actor.accountId,
                entityType: "attendance_record",
                entityId: commandData.id,
                outcome: "SUCCESS",
                dedupeKey,
                payload: {
                  endpoint: "/v0/attendance/force-end",
                  replayed: false,
                  targetAccountId,
                  forceEndReason,
                },
              });

              if (outbox.inserted && outbox.row) {
                await txSyncRepository.appendChange({
                  tenantId,
                  branchId,
                  accountId: commandData.accountId,
                  moduleKey: "attendance",
                  entityType: "attendance_record",
                  entityId: commandData.id,
                  operation: "UPSERT",
                  revision: `attendance:${outbox.row.id}`,
                  data: commandData,
                  changedAt: outbox.row.occurred_at,
                  sourceOutboxId: outbox.row.id,
                });
              }

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
                  entityId: targetAccountId,
                  dedupeKey,
                  metadata: {
                    replayed: false,
                    endpoint: "/v0/attendance/force-end",
                    targetAccountId,
                    forceEndReason,
                  },
                });
                await txOutboxRepository.insertEvent({
                  tenantId,
                  branchId,
                  actionKey,
                  eventType: "ATTENDANCE_FORCE_END_REJECTED",
                  actorType: "ACCOUNT",
                  actorId: actor.accountId,
                  entityType: "attendance_record",
                  entityId: targetAccountId,
                  outcome: "REJECTED",
                  reasonCode,
                  dedupeKey,
                  payload: {
                    endpoint: "/v0/attendance/force-end",
                    targetAccountId,
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

  router.get("/branch", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await service.listBranch({
        actor,
        accountId: asString(req.query?.accountId),
        occurredFrom: asString(req.query?.occurredFrom),
        occurredTo: asString(req.query?.occurredTo),
        limit: asNumber(req.query?.limit),
        offset: asNumber(req.query?.offset),
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get("/tenant", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await service.listTenant({
        actor,
        branchId: asString(req.query?.branchId),
        accountId: asString(req.query?.accountId),
        occurredFrom: asString(req.query?.occurredFrom),
        occurredTo: asString(req.query?.occurredTo),
        limit: asNumber(req.query?.limit),
        offset: asNumber(req.query?.offset),
      });
      res.status(200).json({ success: true, data });
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
      case "target has no active check-in":
        return "TARGET_NO_ACTIVE_CHECK_IN";
      case "targetAccountId must be a valid UUID":
        return "TARGET_ACCOUNT_ID_INVALID";
      case "reason is required":
        return "FORCE_END_REASON_REQUIRED";
      case "reason must be <= 500 characters":
        return "FORCE_END_REASON_INVALID";
      case "occurredFrom must be a valid ISO timestamp":
      case "occurredTo must be a valid ISO timestamp":
        return "INVALID_OCCURRED_RANGE";
      case "occurredFrom must be <= occurredTo":
        return "INVALID_OCCURRED_RANGE";
      case "accountId must be a valid UUID":
        return "INVALID_ACCOUNT_ID";
      case "branchId must be a valid UUID":
        return "INVALID_BRANCH_ID";
      case "occurredAt must be a valid ISO timestamp":
        return "INVALID_OCCURRED_AT";
      case "location must be an object":
        return "INVALID_LOCATION_PAYLOAD";
      case "location.latitude must be a number":
      case "location.latitude must be in range [-90, 90]":
        return "INVALID_LOCATION_LATITUDE";
      case "location.longitude must be a number":
      case "location.longitude must be in range [-180, 180]":
        return "INVALID_LOCATION_LONGITUDE";
      case "location.accuracyMeters must be a number":
      case "location.accuracyMeters must be >= 0":
        return "INVALID_LOCATION_ACCURACY_METERS";
      case "location.capturedAt must be a valid ISO timestamp":
        return "INVALID_LOCATION_CAPTURED_AT";
      case "tenant context required":
        return "TENANT_CONTEXT_REQUIRED";
      case "branch context required":
        return "BRANCH_CONTEXT_REQUIRED";
      case "branch not found":
        return "BRANCH_NOT_FOUND";
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

function asString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === "string") {
      const normalized = first.trim();
      return normalized.length > 0 ? normalized : undefined;
    }
  }
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  const normalized = asString(value);
  if (!normalized) {
    return undefined;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
}
