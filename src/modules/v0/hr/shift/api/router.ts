import { Router, type Response } from "express";
import type { Pool } from "pg";
import { requireV0Auth, type V0AuthRequest } from "../../../auth/api/middleware.js";
import { TransactionManager } from "../../../../../platform/db/transactionManager.js";
import {
  getIdempotencyKeyFromHeader,
  V0IdempotencyError,
  V0IdempotencyService,
} from "../../../../../platform/idempotency/service.js";
import { V0CommandOutboxRepository } from "../../../../../platform/outbox/repository.js";
import { V0PullSyncRepository } from "../../../platformSystem/pullSync/infra/repository.js";
import { V0AuditService } from "../../../audit/app/service.js";
import { V0AuditRepository } from "../../../audit/infra/repository.js";
import {
  buildShiftCommandDedupeKey,
  V0_SHIFT_ACTION_KEYS,
  V0_SHIFT_EVENT_TYPES,
  V0_SHIFT_IDEMPOTENCY_SCOPE,
} from "../app/command-contract.js";
import { V0ShiftError, V0ShiftService } from "../app/service.js";
import { V0ShiftRepository } from "../infra/repository.js";

type ShiftResponseBody =
  | {
      success: true;
      data: unknown;
    }
  | {
      success: false;
      error: string;
      code?: string;
      details?: Record<string, unknown>;
    };

type ShiftWriteTransactionResult =
  | {
      status: "SUCCESS";
      data: unknown;
    }
  | {
      status: "REJECTED";
      error: V0ShiftError;
    };

export function createV0ShiftRouter(input: {
  service: V0ShiftService;
  idempotencyService: V0IdempotencyService;
  db: Pool;
}): Router {
  const router = Router();
  const transactionManager = new TransactionManager(input.db);

  router.get("/shifts/schedule", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await input.service.listSchedule({
        actor,
        branchId: asString(req.query?.branchId),
        membershipId: asString(req.query?.membershipId),
        from: asString(req.query?.from),
        to: asString(req.query?.to),
        patternStatus: asString(req.query?.patternStatus),
        instanceStatus: asString(req.query?.instanceStatus),
        limit: asNumber(req.query?.limit),
        offset: asNumber(req.query?.offset),
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get("/shifts/me", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await input.service.listMySchedule({
        actor,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get(
    "/shifts/memberships/:membershipId",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      try {
        const actor = req.v0Auth;
        if (!actor) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await input.service.listMembershipSchedule({
          actor,
          membershipId: req.params.membershipId,
          from: asString(req.query?.from),
          to: asString(req.query?.to),
          patternStatus: asString(req.query?.patternStatus),
          instanceStatus: asString(req.query?.instanceStatus),
          limit: asNumber(req.query?.limit),
          offset: asNumber(req.query?.offset),
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.get(
    "/shifts/instances/:instanceId",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      try {
        const actor = req.v0Auth;
        if (!actor) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await input.service.getInstance({
          actor,
          instanceId: req.params.instanceId,
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post("/shifts/patterns", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    await executeWrite({
      req,
      res,
      idempotencyService: input.idempotencyService,
      actionKey: V0_SHIFT_ACTION_KEYS.createPattern,
      eventType: V0_SHIFT_EVENT_TYPES.patternCreated,
      endpoint: "/v0/hr/shifts/patterns",
      entityType: "shift_pattern",
      successStatusCode: 201,
      transactionManager,
      handler: async (service) =>
        service.createPattern({
          actor: req.v0Auth!,
          body: toRecord(req.body),
        }),
    });
  });

  router.patch(
    "/shifts/patterns/:patternId",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_SHIFT_ACTION_KEYS.updatePattern,
        eventType: V0_SHIFT_EVENT_TYPES.patternUpdated,
        endpoint: "/v0/hr/shifts/patterns/:patternId",
        entityType: "shift_pattern",
        successStatusCode: 200,
        transactionManager,
        handler: async (service) =>
          service.updatePattern({
            actor: req.v0Auth!,
            patternId: req.params.patternId,
            body: toRecord(req.body),
          }),
      });
    }
  );

  router.post(
    "/shifts/patterns/:patternId/deactivate",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_SHIFT_ACTION_KEYS.deactivatePattern,
        eventType: V0_SHIFT_EVENT_TYPES.patternDeactivated,
        endpoint: "/v0/hr/shifts/patterns/:patternId/deactivate",
        entityType: "shift_pattern",
        successStatusCode: 200,
        transactionManager,
        handler: async (service) =>
          service.deactivatePattern({
            actor: req.v0Auth!,
            patternId: req.params.patternId,
          }),
      });
    }
  );

  router.post("/shifts/instances", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    await executeWrite({
      req,
      res,
      idempotencyService: input.idempotencyService,
      actionKey: V0_SHIFT_ACTION_KEYS.createInstance,
      eventType: V0_SHIFT_EVENT_TYPES.instanceCreated,
      endpoint: "/v0/hr/shifts/instances",
      entityType: "shift_instance",
      successStatusCode: 201,
      transactionManager,
      handler: async (service) =>
        service.createInstance({
          actor: req.v0Auth!,
          body: toRecord(req.body),
        }),
    });
  });

  router.patch(
    "/shifts/instances/:instanceId",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_SHIFT_ACTION_KEYS.updateInstance,
        eventType: V0_SHIFT_EVENT_TYPES.instanceUpdated,
        endpoint: "/v0/hr/shifts/instances/:instanceId",
        entityType: "shift_instance",
        successStatusCode: 200,
        transactionManager,
        handler: async (service) =>
          service.updateInstance({
            actor: req.v0Auth!,
            instanceId: req.params.instanceId,
            body: toRecord(req.body),
          }),
      });
    }
  );

  router.post(
    "/shifts/instances/:instanceId/cancel",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_SHIFT_ACTION_KEYS.cancelInstance,
        eventType: V0_SHIFT_EVENT_TYPES.instanceCancelled,
        endpoint: "/v0/hr/shifts/instances/:instanceId/cancel",
        entityType: "shift_instance",
        successStatusCode: 200,
        transactionManager,
        handler: async (service) =>
          service.cancelInstance({
            actor: req.v0Auth!,
            instanceId: req.params.instanceId,
            reason: parseOptionalString(toRecord(req.body).reason),
          }),
      });
    }
  );

  return router;

  async function executeWrite(inputWrite: {
    req: V0AuthRequest;
    res: Response;
    idempotencyService: V0IdempotencyService;
    actionKey: string;
    eventType: string;
    entityType: string;
    endpoint: string;
    successStatusCode: number;
    transactionManager: TransactionManager;
    handler: (service: V0ShiftService) => Promise<unknown>;
  }): Promise<void> {
    const actor = inputWrite.req.v0Auth;
    const idempotencyKey = getIdempotencyKeyFromHeader(inputWrite.req.headers);
    const actionKey = inputWrite.actionKey;

    try {
      if (!actor) {
        inputWrite.res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const tenantId = String(actor.tenantId ?? "").trim();
      const branchId = String(actor.branchId ?? "").trim();

      const result = await inputWrite.idempotencyService.execute<ShiftResponseBody>({
        idempotencyKey,
        actionKey,
        scope: V0_SHIFT_IDEMPOTENCY_SCOPE,
        tenantId,
        branchId,
        payload: {
          params: inputWrite.req.params,
          body: inputWrite.req.body,
        },
        handler: async () => {
          const txResult = await inputWrite.transactionManager.withTransaction<ShiftWriteTransactionResult>(
            async (client) => {
            const txService = new V0ShiftService(new V0ShiftRepository(client));
            const txAuditService = new V0AuditService(new V0AuditRepository(client));
            const txOutboxRepository = new V0CommandOutboxRepository(client);
            const txSyncRepository = new V0PullSyncRepository(client);

              try {
                const commandData = await inputWrite.handler(txService);
                const entityId = String((commandData as { id?: string })?.id ?? tenantId);
                const targetBranchId =
                  parseOptionalString((commandData as { branchId?: unknown })?.branchId) ??
                  branchId;
                const dedupeKey = buildShiftCommandDedupeKey(actionKey, idempotencyKey, "SUCCESS");

                await txAuditService.recordEvent({
                  tenantId,
                  branchId: targetBranchId || null,
                  actorAccountId: actor.accountId,
                  actionKey,
                  outcome: "SUCCESS",
                  reasonCode: null,
                  entityType: inputWrite.entityType,
                  entityId,
                  dedupeKey,
                  metadata: {
                    endpoint: inputWrite.endpoint,
                    replayed: false,
                  },
                });

                const outbox = await txOutboxRepository.insertEvent({
                  tenantId,
                  branchId: targetBranchId || null,
                  actionKey,
                  eventType: inputWrite.eventType,
                  actorType: "ACCOUNT",
                  actorId: actor.accountId,
                  entityType: inputWrite.entityType,
                  entityId,
                  outcome: "SUCCESS",
                  dedupeKey,
                  payload: {
                    endpoint: inputWrite.endpoint,
                    replayed: false,
                  },
                });

                if (outbox.inserted && outbox.row && targetBranchId) {
                  await txSyncRepository.appendChange({
                    tenantId,
                    branchId: targetBranchId,
                    moduleKey: "shift",
                    entityType: inputWrite.entityType,
                    entityId,
                    operation: "UPSERT",
                    revision: `shift:${outbox.row.id}`,
                    data: toSyncData(commandData),
                    changedAt: outbox.row.occurred_at,
                    sourceOutboxId: outbox.row.id,
                  });
                }

                await txOutboxRepository.insertEvent({
                  tenantId,
                  branchId: targetBranchId || null,
                  actionKey,
                  eventType: V0_SHIFT_EVENT_TYPES.workReviewEvaluationRequested,
                  actorType: "SYSTEM",
                  actorId: null,
                  entityType: "work_review_evaluation_trigger",
                  entityId,
                  outcome: "SUCCESS",
                  dedupeKey: buildShiftCommandDedupeKey(
                    `${actionKey}.work_review_evaluation`,
                    idempotencyKey,
                    "SUCCESS"
                  ),
                  payload: buildWorkReviewEvaluationPayload({
                    actionKey,
                    sourceEventType: inputWrite.eventType,
                    sourceEntityType: inputWrite.entityType,
                    sourceEntityId: entityId,
                    sourceData: commandData,
                    endpoint: inputWrite.endpoint,
                  }),
                });

                return {
                  status: "SUCCESS",
                  data: commandData,
                };
              } catch (error) {
                if (error instanceof V0ShiftError) {
                  const reasonCode = classifyShiftReasonCode(error);
                  const rejectedEntityId =
                    resolveRejectedEntityId(inputWrite.req) ?? actor.accountId;
                  const dedupeKey = buildShiftCommandDedupeKey(actionKey, idempotencyKey, "REJECTED");

                  await txAuditService.recordEvent({
                    tenantId,
                    branchId: branchId || null,
                    actorAccountId: actor.accountId,
                    actionKey,
                    outcome: "REJECTED",
                    reasonCode,
                    entityType: inputWrite.entityType,
                    entityId: rejectedEntityId,
                    dedupeKey,
                    metadata: {
                      endpoint: inputWrite.endpoint,
                      replayed: false,
                    },
                  });

                  await txOutboxRepository.insertEvent({
                    tenantId,
                    branchId: branchId || null,
                    actionKey,
                    eventType: V0_SHIFT_EVENT_TYPES.commandRejected,
                    actorType: "ACCOUNT",
                    actorId: actor.accountId,
                    entityType: inputWrite.entityType,
                    entityId: rejectedEntityId,
                    outcome: "REJECTED",
                    reasonCode,
                    dedupeKey,
                    payload: {
                      endpoint: inputWrite.endpoint,
                      replayed: false,
                      code: error.code ?? null,
                    },
                  });

                  return {
                    status: "REJECTED",
                    error,
                  };
                }
                throw error;
              }
            }
          );

          if (txResult.status === "REJECTED") {
            return {
              statusCode: txResult.error.statusCode,
              body: {
                success: false,
                error: txResult.error.message,
                code: txResult.error.code,
                details: txResult.error.details,
              },
            };
          }

          return {
            statusCode: inputWrite.successStatusCode,
            body: {
              success: true,
              data: txResult.data,
            },
          };
        },
      });

      if (result.replayed) {
        inputWrite.res.setHeader("Idempotency-Replayed", "true");
      }
      inputWrite.res.status(result.statusCode).json(result.body);
    } catch (error) {
      handleError(inputWrite.res, error);
    }
  }
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toRecord(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  const str = asString(value);
  if (!str) {
    return undefined;
  }
  const parsed = Number(str);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function parseOptionalUuid(value: unknown): string | null {
  const normalized = parseOptionalString(value);
  if (!normalized) {
    return null;
  }
  return UUID_REGEX.test(normalized) ? normalized : null;
}

function resolveRejectedEntityId(req: V0AuthRequest): string | null {
  return (
    parseOptionalUuid(req.params?.patternId) ??
    parseOptionalUuid(req.params?.instanceId) ??
    parseOptionalUuid(toRecord(req.body).membershipId) ??
    null
  );
}

function classifyShiftReasonCode(error: V0ShiftError): string {
  const code = parseOptionalString(error.code);
  return code ?? "SHIFT_COMMAND_REJECTED";
}

function toSyncData(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return { value: data };
}

function buildWorkReviewEvaluationPayload(input: {
  actionKey: string;
  sourceEventType: string;
  sourceEntityType: string;
  sourceEntityId: string;
  sourceData: unknown;
  endpoint: string;
}): Record<string, unknown> {
  const source = toSyncData(input.sourceData);
  return {
    triggerType: "SHIFT_CHANGED",
    actionKey: input.actionKey,
    sourceEventType: input.sourceEventType,
    sourceEntityType: input.sourceEntityType,
    sourceEntityId: input.sourceEntityId,
    endpoint: input.endpoint,
    membershipId: parseOptionalUuid(source.membershipId),
    branchId: parseOptionalUuid(source.branchId),
    date: parseOptionalString(source.date),
    effectiveFrom: parseOptionalString(source.effectiveFrom),
    effectiveTo: parseOptionalString(source.effectiveTo),
  };
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
  if (error instanceof V0ShiftError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
      details: error.details,
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: error instanceof Error ? error.message : "internal server error",
  });
}
