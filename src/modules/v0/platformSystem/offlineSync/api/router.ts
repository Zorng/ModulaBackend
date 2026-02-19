import { Router, type Response } from "express";
import type { PoolClient } from "pg";
import { requireV0Auth, type V0AuthRequest } from "../../../auth/api/middleware.js";
import { TransactionManager } from "../../../../../platform/db/transactionManager.js";
import { hashJsonPayload } from "../../../../../shared/utils/hash.js";
import { V0AttendanceService } from "../../../hr/attendance/app/service.js";
import { V0AttendanceRepository } from "../../../hr/attendance/infra/repository.js";
import { V0CashSessionError, V0CashSessionService } from "../../../posOperation/cashSession/app/service.js";
import { V0CashSessionRepository } from "../../../posOperation/cashSession/infra/repository.js";
import {
  V0_OFFLINE_SYNC_ACTION_KEYS,
  V0_OFFLINE_SYNC_OPERATION_TYPES,
  type V0OfflineSyncOperationType,
} from "../app/command-contract.js";
import { V0OfflineSyncService } from "../app/service.js";
import {
  type V0OfflineSyncOperationRow,
  V0OfflineSyncRepository,
} from "../infra/repository.js";

type ActorScope = {
  accountId: string;
  tenantId: string;
  branchId: string;
};

type ReplayOperation = {
  index: number;
  clientOpId: string;
  operationType: V0OfflineSyncOperationType;
  tenantId: string;
  branchId: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
  payloadHash: string;
};

type ReplayResult = {
  index: number;
  clientOpId: string;
  operationType: V0OfflineSyncOperationType;
  status: "APPLIED" | "DUPLICATE" | "FAILED";
  code?: string;
  message?: string;
  resultRefId?: string | null;
};

type ApplyOutcome =
  | { status: "APPLIED"; resultRefId: string | null }
  | { status: "FAILED"; failureCode: string; failureMessage: string };

export class V0OfflineSyncError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "V0OfflineSyncError";
  }
}

export function createV0OfflineSyncRouter(input: {
  service: V0OfflineSyncService;
  transactionManager: TransactionManager;
}): Router {
  const router = Router();

  router.post("/replay", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = assertActorScope(req);
      const parsed = parseReplayRequestBody(req.body, actor);
      const batch = await input.service.createBatch({
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        submittedByAccountId: actor.accountId,
        haltOnFailure: parsed.haltOnFailure,
      });

      const results: ReplayResult[] = [];
      let stoppedAt: number | null = null;
      let appliedCount = 0;
      let duplicateCount = 0;
      let failedCount = 0;

      for (const operation of parsed.operations) {
        const result = await input.transactionManager.withTransaction(
          async (client) => executeOperationInTransaction(client, batch.id, actor, operation),
          {
            requestId: req.v0Context?.requestId,
            actionKey: V0_OFFLINE_SYNC_ACTION_KEYS.replayApply,
            tenantId: actor.tenantId,
            branchId: actor.branchId,
          }
        );

        results.push(result);
        if (result.status === "APPLIED") {
          appliedCount += 1;
        } else if (result.status === "DUPLICATE") {
          duplicateCount += 1;
        } else {
          failedCount += 1;
          if (parsed.haltOnFailure) {
            stoppedAt = operation.index;
            break;
          }
        }
      }

      const operationCount = results.length;
      const finalStatus =
        failedCount === 0
          ? "COMPLETED"
          : appliedCount + duplicateCount > 0
            ? "PARTIAL"
            : "FAILED";

      await input.service.finalizeBatch({
        batchId: batch.id,
        status: finalStatus,
        operationCount,
        appliedCount,
        duplicateCount,
        failedCount,
        stoppedAt,
      });

      res.status(200).json({
        success: true,
        data: {
          batchId: batch.id,
          results,
          stoppedAt,
        },
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get(
    "/replay/batches/:batchId",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      try {
        const actor = assertActorScope(req);
        const batchId = assertUuid(req.params.batchId, "batchId");

        const detail = await input.service.getBatchDetail({
          tenantId: actor.tenantId,
          branchId: actor.branchId,
          batchId,
        });
        if (!detail) {
          throw new V0OfflineSyncError(
            404,
            "OFFLINE_SYNC_BATCH_NOT_FOUND",
            "offline sync batch not found"
          );
        }

        res.status(200).json({
          success: true,
          data: {
            batchId: detail.batch.id,
            tenantId: detail.batch.tenant_id,
            branchId: detail.batch.branch_id,
            createdAt: detail.batch.created_at.toISOString(),
            status: detail.batch.status,
            haltedOnFailure: detail.batch.halt_on_failure,
            stoppedAt: detail.batch.stopped_at,
            results: detail.operations.map(mapPersistedOperationToReplayResult),
          },
        });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  return router;
}

async function executeOperationInTransaction(
  client: PoolClient,
  batchId: string,
  actor: ActorScope,
  operation: ReplayOperation
): Promise<ReplayResult> {
  const service = new V0OfflineSyncService(new V0OfflineSyncRepository(client));
  const started = await service.startOperation({
    batchId,
    tenantId: actor.tenantId,
    branchId: actor.branchId,
    operation: {
      index: operation.index,
      clientOpId: operation.clientOpId,
      operationType: operation.operationType,
      occurredAt: operation.occurredAt,
      payload: operation.payload,
      payloadHash: operation.payloadHash,
    },
  });

  if (!started.started) {
    if (started.payloadConflict) {
      return {
        index: operation.index,
        clientOpId: operation.clientOpId,
        operationType: operation.operationType,
        status: "FAILED",
        code: "OFFLINE_SYNC_PAYLOAD_CONFLICT",
        message: "clientOpId already used with different payload",
      };
    }
    return mapExistingOperationToReplayResult(operation, started.row);
  }

  const outcome = await applyOperation({
    client,
    actor,
    operation,
  });

  const completed = await service.completeOperation({
    operationId: started.row.id,
    status: outcome.status,
    failureCode: outcome.status === "FAILED" ? outcome.failureCode : null,
    failureMessage: outcome.status === "FAILED" ? outcome.failureMessage : null,
    resultRefId: outcome.status === "APPLIED" ? outcome.resultRefId : null,
  });
  if (!completed) {
    throw new Error("failed to finalize offline sync operation");
  }

  return mapPersistedOperationToReplayResult(completed);
}

async function applyOperation(input: {
  client: PoolClient;
  actor: ActorScope;
  operation: ReplayOperation;
}): Promise<ApplyOutcome> {
  const attendanceService = new V0AttendanceService(new V0AttendanceRepository(input.client));
  const cashService = new V0CashSessionService(new V0CashSessionRepository(input.client));

  try {
    switch (input.operation.operationType) {
      case "sale.finalize":
        return {
          status: "FAILED",
          failureCode: "OFFLINE_SYNC_OPERATION_NOT_SUPPORTED",
          failureMessage: "sale.finalize replay is not implemented yet",
        };
      case "attendance.startWork": {
        const occurredAt = getOptionalIsoString(input.operation.payload.occurredAt);
        const record = await attendanceService.checkIn({
          actor: input.actor,
          occurredAt: occurredAt ?? undefined,
        });
        return { status: "APPLIED", resultRefId: record.id };
      }
      case "attendance.endWork": {
        const occurredAt = getOptionalIsoString(input.operation.payload.occurredAt);
        const record = await attendanceService.checkOut({
          actor: input.actor,
          occurredAt: occurredAt ?? undefined,
        });
        return { status: "APPLIED", resultRefId: record.id };
      }
      case "cashSession.open": {
        const session = await cashService.openSession({
          actor: input.actor,
          body: input.operation.payload,
        });
        return { status: "APPLIED", resultRefId: session.id };
      }
      case "cashSession.close": {
        const sessionId = assertUuid(input.operation.payload.sessionId, "payload.sessionId");
        const payload = stripSessionId(input.operation.payload);
        const session = await cashService.closeSession({
          actor: input.actor,
          sessionId,
          body: payload,
        });
        return { status: "APPLIED", resultRefId: session.id };
      }
      case "cashSession.movement": {
        const sessionId = assertUuid(input.operation.payload.sessionId, "payload.sessionId");
        const movementType = normalizeMovementType(input.operation.payload.movementType);
        const idempotencyKey = `offline-sync:${input.operation.clientOpId}`;

        if (movementType === "PAID_IN") {
          const movement = await cashService.recordPaidIn({
            actor: input.actor,
            sessionId,
            body: {
              amountUsd: input.operation.payload.amountUsd,
              amountKhr: input.operation.payload.amountKhr,
              reason: input.operation.payload.reason,
            },
            idempotencyKey,
          });
          return { status: "APPLIED", resultRefId: movement.id };
        }

        if (movementType === "PAID_OUT") {
          const movement = await cashService.recordPaidOut({
            actor: input.actor,
            sessionId,
            body: {
              amountUsd: input.operation.payload.amountUsd,
              amountKhr: input.operation.payload.amountKhr,
              reason: input.operation.payload.reason,
            },
            idempotencyKey,
          });
          return { status: "APPLIED", resultRefId: movement.id };
        }

        const movement = await cashService.recordAdjustment({
          actor: input.actor,
          sessionId,
          body: {
            amountUsdDelta: input.operation.payload.amountUsdDelta,
            amountKhrDelta: input.operation.payload.amountKhrDelta,
            reason: input.operation.payload.reason,
          },
          idempotencyKey,
        });
        return { status: "APPLIED", resultRefId: movement.id };
      }
      default: {
        return {
          status: "FAILED",
          failureCode: "OFFLINE_SYNC_OPERATION_NOT_SUPPORTED",
          failureMessage: `unsupported operation type: ${input.operation.operationType}`,
        };
      }
    }
  } catch (error) {
    if (error instanceof V0CashSessionError) {
      return {
        status: "FAILED",
        failureCode: error.code ?? "OFFLINE_SYNC_OPERATION_REJECTED",
        failureMessage: error.message,
      };
    }
    if (error instanceof Error && error.name === "V0AttendanceError") {
      return {
        status: "FAILED",
        failureCode: mapAttendanceMessageToCode(error.message),
        failureMessage: error.message,
      };
    }
    return {
      status: "FAILED",
      failureCode: "OFFLINE_SYNC_OPERATION_FAILED",
      failureMessage: error instanceof Error ? error.message : "offline replay failed",
    };
  }
}

function mapAttendanceMessageToCode(message: string): string {
  if (message === "already checked in") {
    return "ATTENDANCE_ALREADY_CHECKED_IN";
  }
  if (message === "no active check-in") {
    return "ATTENDANCE_NO_ACTIVE_CHECKIN";
  }
  if (message === "tenant context required") {
    return "TENANT_CONTEXT_REQUIRED";
  }
  if (message === "branch context required") {
    return "BRANCH_CONTEXT_REQUIRED";
  }
  if (message === "authentication required") {
    return "INVALID_ACCESS_TOKEN";
  }
  return "OFFLINE_SYNC_OPERATION_REJECTED";
}

function mapExistingOperationToReplayResult(
  operation: ReplayOperation,
  row: V0OfflineSyncOperationRow
): ReplayResult {
  if (row.status === "IN_PROGRESS") {
    return {
      index: operation.index,
      clientOpId: operation.clientOpId,
      operationType: operation.operationType,
      status: "FAILED",
      code: "OFFLINE_SYNC_IN_PROGRESS",
      message: "operation is currently in progress",
    };
  }
  if (row.status === "FAILED") {
    return {
      index: operation.index,
      clientOpId: operation.clientOpId,
      operationType: operation.operationType,
      status: "FAILED",
      code: row.failure_code ?? "OFFLINE_SYNC_OPERATION_FAILED",
      message: row.failure_message ?? "operation failed",
      resultRefId: row.result_ref_id,
    };
  }
  return {
    index: operation.index,
    clientOpId: operation.clientOpId,
    operationType: operation.operationType,
    status: "DUPLICATE",
    resultRefId: row.result_ref_id,
  };
}

function mapPersistedOperationToReplayResult(row: V0OfflineSyncOperationRow): ReplayResult {
  if (row.status === "FAILED") {
    return {
      index: row.operation_index,
      clientOpId: row.client_op_id,
      operationType: row.operation_type as V0OfflineSyncOperationType,
      status: "FAILED",
      code: row.failure_code ?? "OFFLINE_SYNC_OPERATION_FAILED",
      message: row.failure_message ?? "operation failed",
      resultRefId: row.result_ref_id,
    };
  }
  if (row.status === "IN_PROGRESS") {
    return {
      index: row.operation_index,
      clientOpId: row.client_op_id,
      operationType: row.operation_type as V0OfflineSyncOperationType,
      status: "FAILED",
      code: "OFFLINE_SYNC_IN_PROGRESS",
      message: "operation is currently in progress",
      resultRefId: row.result_ref_id,
    };
  }
  return {
    index: row.operation_index,
    clientOpId: row.client_op_id,
    operationType: row.operation_type as V0OfflineSyncOperationType,
    status: row.status,
    resultRefId: row.result_ref_id,
  };
}

function parseReplayRequestBody(
  body: unknown,
  actor: ActorScope
): {
  operations: ReplayOperation[];
  haltOnFailure: boolean;
} {
  const normalized = asRecord(body, "body must be an object");
  const operationsRaw = normalized.operations;
  if (!Array.isArray(operationsRaw) || operationsRaw.length === 0) {
    throw new V0OfflineSyncError(
      422,
      "OFFLINE_SYNC_PAYLOAD_INVALID",
      "operations must be a non-empty array"
    );
  }
  if (operationsRaw.length > 100) {
    throw new V0OfflineSyncError(
      422,
      "OFFLINE_SYNC_PAYLOAD_INVALID",
      "operations cannot exceed 100 entries"
    );
  }

  const operations = operationsRaw.map((raw, index) =>
    parseOperation(raw, index, actor)
  );
  const haltOnFailure = normalizeHaltOnFailure(normalized.haltOnFailure);
  return { operations, haltOnFailure };
}

function parseOperation(
  raw: unknown,
  index: number,
  actor: ActorScope
): ReplayOperation {
  const value = asRecord(raw, `operations[${index}] must be an object`);
  const clientOpId = assertUuid(value.clientOpId, `operations[${index}].clientOpId`);
  const operationType = assertOperationType(value.operationType, index);
  const tenantId = assertUuid(value.tenantId, `operations[${index}].tenantId`);
  const branchId = assertUuid(value.branchId, `operations[${index}].branchId`);

  if (tenantId !== actor.tenantId || branchId !== actor.branchId) {
    throw new V0OfflineSyncError(
      422,
      "OFFLINE_SYNC_CONTEXT_MISMATCH",
      `operations[${index}] tenant/branch context does not match token`
    );
  }

  const occurredAt = parseOccurredAt(value.occurredAt, index);
  const payload = asRecord(value.payload, `operations[${index}].payload must be an object`);

  return {
    index,
    clientOpId,
    operationType,
    tenantId,
    branchId,
    occurredAt,
    payload,
    payloadHash: hashJsonPayload(payload),
  };
}

function assertOperationType(
  value: unknown,
  index: number
): V0OfflineSyncOperationType {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new V0OfflineSyncError(
      422,
      "OFFLINE_SYNC_PAYLOAD_INVALID",
      `operations[${index}].operationType is required`
    );
  }
  if (!(V0_OFFLINE_SYNC_OPERATION_TYPES as readonly string[]).includes(normalized)) {
    throw new V0OfflineSyncError(
      422,
      "OFFLINE_SYNC_OPERATION_NOT_SUPPORTED",
      `unsupported operationType: ${normalized}`
    );
  }
  return normalized as V0OfflineSyncOperationType;
}

function parseOccurredAt(value: unknown, index: number): Date {
  const raw = normalizeOptionalString(value);
  if (!raw) {
    throw new V0OfflineSyncError(
      422,
      "OFFLINE_SYNC_PAYLOAD_INVALID",
      `operations[${index}].occurredAt is required`
    );
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new V0OfflineSyncError(
      422,
      "OFFLINE_SYNC_PAYLOAD_INVALID",
      `operations[${index}].occurredAt must be a valid ISO timestamp`
    );
  }
  return parsed;
}

function assertActorScope(req: V0AuthRequest): ActorScope {
  const actor = req.v0Auth;
  if (!actor) {
    throw new V0OfflineSyncError(401, "INVALID_ACCESS_TOKEN", "authentication required");
  }
  const accountId = normalizeRequiredString(actor.accountId, "INVALID_ACCESS_TOKEN");
  const tenantId = normalizeRequiredString(actor.tenantId, "TENANT_CONTEXT_REQUIRED");
  const branchId = normalizeRequiredString(actor.branchId, "BRANCH_CONTEXT_REQUIRED");
  return { accountId, tenantId, branchId };
}

function normalizeRequiredString(value: unknown, code: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new V0OfflineSyncError(403, code, code);
  }
  return normalized;
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeHaltOnFailure(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === undefined || value === null) {
    return true;
  }
  return String(value).toLowerCase() !== "false";
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new V0OfflineSyncError(422, "OFFLINE_SYNC_PAYLOAD_INVALID", message);
  }
  return value as Record<string, unknown>;
}

function assertUuid(value: unknown, fieldName: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized || !UUID_PATTERN.test(normalized)) {
    throw new V0OfflineSyncError(
      422,
      "OFFLINE_SYNC_PAYLOAD_INVALID",
      `${fieldName} must be a valid UUID`
    );
  }
  return normalized;
}

function getOptionalIsoString(value: unknown): string | null {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new V0OfflineSyncError(
      422,
      "OFFLINE_SYNC_PAYLOAD_INVALID",
      "occurredAt must be a valid ISO timestamp"
    );
  }
  return parsed.toISOString();
}

function normalizeMovementType(value: unknown): "PAID_IN" | "PAID_OUT" | "ADJUSTMENT" {
  const normalized = normalizeOptionalString(value)?.toUpperCase();
  if (normalized === "PAID_IN" || normalized === "PAID_OUT" || normalized === "ADJUSTMENT") {
    return normalized;
  }
  throw new V0OfflineSyncError(
    422,
    "OFFLINE_SYNC_PAYLOAD_INVALID",
    "payload.movementType must be PAID_IN, PAID_OUT, or ADJUSTMENT"
  );
}

function stripSessionId(payload: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...payload };
  delete copy.sessionId;
  return copy;
}

function handleError(res: Response, error: unknown): void {
  if (error instanceof V0OfflineSyncError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
    });
    return;
  }
  res.status(500).json({
    success: false,
    error: error instanceof Error ? error.message : "internal server error",
  });
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
