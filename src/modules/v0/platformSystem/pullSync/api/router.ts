import { Router, type Response } from "express";
import { requireV0Auth, type V0AuthRequest } from "../../../auth/api/middleware.js";
import {
  V0PullSyncService,
  buildModuleScopeHash,
  normalizeModuleScopes,
} from "../app/service.js";
import {
  V0_PULL_SYNC_MODULE_KEYS,
  type V0PullSyncModuleKey,
} from "../app/command-contract.js";

type ActorScope = {
  accountId: string;
  tenantId: string;
  branchId: string;
};

type SyncCursorPayload = {
  v: 1;
  tenantId: string;
  branchId: string;
  moduleScopeHash: string;
  lastSequence: string;
};

export class V0PullSyncError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "V0PullSyncError";
  }
}

export function createV0PullSyncRouter(service: V0PullSyncService): Router {
  const router = Router();

  router.post("/pull", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = assertActorScope(req);
      const body = asRecord(req.body, "body must be an object");
      const moduleScopes = parseModuleScopes(body.moduleScopes);
      const moduleScopeHash = buildModuleScopeHash(moduleScopes);
      const limit = normalizeLimit(body.limit);
      const deviceId = normalizeOptionalString(body.deviceId);

      let lastSequence = "0";
      const cursorRaw = body.cursor;
      if (cursorRaw !== undefined && cursorRaw !== null) {
        const cursor = decodeCursor(cursorRaw);
        assertCursorMatchesScope(cursor, actor, moduleScopeHash);
        lastSequence = cursor.lastSequence;
      } else if (deviceId) {
        const checkpoint = await service.getCheckpoint({
          accountId: actor.accountId,
          deviceId,
          tenantId: actor.tenantId,
          branchId: actor.branchId,
          moduleScopes,
        });
        lastSequence = checkpoint?.last_sequence ?? "0";
      }

      const pulled = await service.pull({
        accountId: actor.accountId,
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        cursorSequence: lastSequence,
        limit,
        moduleScopes,
      });

      const nextCursor = encodeCursor({
        v: 1,
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        moduleScopeHash,
        lastSequence: pulled.nextCursorSequence,
      });

      if (deviceId) {
        await service.upsertCheckpoint({
          accountId: actor.accountId,
          deviceId,
          tenantId: actor.tenantId,
          branchId: actor.branchId,
          moduleScopes,
          lastSequence: pulled.nextCursorSequence,
        });
      }

      res.status(200).json({
        success: true,
        data: {
          cursor: nextCursor,
          hasMore: pulled.hasMore,
          serverTime: new Date().toISOString(),
          changes: pulled.changes.map((change) => ({
            changeId: change.id,
            sequence: change.sequence,
            moduleKey: change.module_key,
            entityType: change.entity_type,
            entityId: change.entity_id,
            operation: change.operation,
            changedAt: change.changed_at.toISOString(),
            revision: change.revision,
            data: change.data,
          })),
        },
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;
}

function assertActorScope(req: V0AuthRequest): ActorScope {
  const actor = req.v0Auth;
  if (!actor) {
    throw new V0PullSyncError(401, "INVALID_ACCESS_TOKEN", "authentication required");
  }
  const accountId = normalizeRequiredString(actor.accountId, "INVALID_ACCESS_TOKEN");
  const tenantId = normalizeRequiredString(actor.tenantId, "TENANT_CONTEXT_REQUIRED");
  const branchId = normalizeRequiredString(actor.branchId, "BRANCH_CONTEXT_REQUIRED");
  return { accountId, tenantId, branchId };
}

function normalizeRequiredString(value: unknown, code: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new V0PullSyncError(403, code, code);
  }
  return normalized;
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeLimit(value: unknown): number {
  const n = Number(value ?? 200);
  if (!Number.isFinite(n)) {
    throw new V0PullSyncError(422, "SYNC_LIMIT_INVALID", "limit must be a number");
  }
  const rounded = Math.floor(n);
  if (rounded <= 0 || rounded > 1000) {
    throw new V0PullSyncError(
      422,
      "SYNC_LIMIT_INVALID",
      "limit must be between 1 and 1000"
    );
  }
  return rounded;
}

function parseModuleScopes(value: unknown): V0PullSyncModuleKey[] {
  if (value === undefined || value === null) {
    return normalizeModuleScopes(undefined);
  }

  if (!Array.isArray(value)) {
    throw new V0PullSyncError(
      422,
      "SYNC_SCOPE_INVALID",
      "moduleScopes must be an array of supported module keys"
    );
  }

  if (value.length === 0) {
    return normalizeModuleScopes(undefined);
  }

  const allowed = new Set<string>(V0_PULL_SYNC_MODULE_KEYS);
  for (let i = 0; i < value.length; i += 1) {
    const normalized = String(value[i] ?? "").trim();
    if (!allowed.has(normalized)) {
      throw new V0PullSyncError(
        422,
        "SYNC_SCOPE_INVALID",
        `moduleScopes[${i}] is not supported`
      );
    }
  }

  return normalizeModuleScopes(value);
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new V0PullSyncError(422, "SYNC_PAYLOAD_INVALID", message);
  }
  return value as Record<string, unknown>;
}

function encodeCursor(payload: SyncCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(value: unknown): SyncCursorPayload {
  const cursor = normalizeOptionalString(value);
  if (!cursor) {
    throw new V0PullSyncError(422, "SYNC_CURSOR_INVALID", "cursor must be a non-empty string");
  }

  let parsed: unknown;
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    parsed = JSON.parse(decoded);
  } catch {
    throw new V0PullSyncError(422, "SYNC_CURSOR_INVALID", "cursor is malformed");
  }

  const record = asRecord(parsed, "cursor is malformed");
  const v = Number(record.v);
  const tenantId = normalizeOptionalString(record.tenantId);
  const branchId = normalizeOptionalString(record.branchId);
  const moduleScopeHash = normalizeOptionalString(record.moduleScopeHash);
  const lastSequence = normalizeOptionalString(record.lastSequence);

  if (
    v !== 1 ||
    !tenantId ||
    !branchId ||
    !moduleScopeHash ||
    !/^[0-9a-f]{64}$/i.test(moduleScopeHash) ||
    !lastSequence ||
    !/^\d+$/.test(lastSequence)
  ) {
    throw new V0PullSyncError(422, "SYNC_CURSOR_INVALID", "cursor is invalid");
  }

  return {
    v: 1,
    tenantId,
    branchId,
    moduleScopeHash: moduleScopeHash.toLowerCase(),
    lastSequence,
  };
}

function assertCursorMatchesScope(
  cursor: SyncCursorPayload,
  actor: ActorScope,
  moduleScopeHash: string
): void {
  if (
    cursor.tenantId !== actor.tenantId ||
    cursor.branchId !== actor.branchId ||
    cursor.moduleScopeHash !== moduleScopeHash
  ) {
    throw new V0PullSyncError(
      422,
      "SYNC_CURSOR_INVALID",
      "cursor does not match current sync scope"
    );
  }
}

function handleError(res: Response, error: unknown): void {
  if (error instanceof V0PullSyncError) {
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
