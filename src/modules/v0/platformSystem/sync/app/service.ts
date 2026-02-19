import { hashJsonPayload } from "../../../../../shared/utils/hash.js";
import {
  V0_SYNC_MODULE_KEYS,
  type V0SyncModuleKey,
} from "./command-contract.js";
import {
  V0SyncRepository,
  type V0SyncCheckpointRow,
  type V0SyncChangeRow,
} from "../infra/repository.js";

export class V0SyncService {
  constructor(private readonly repo: V0SyncRepository) {}

  async pull(input: {
    accountId: string;
    tenantId: string;
    branchId: string;
    cursorSequence: string;
    limit: number;
    moduleScopes: readonly V0SyncModuleKey[];
  }): Promise<{
    changes: V0SyncChangeRow[];
    hasMore: boolean;
    nextCursorSequence: string;
  }> {
    const normalizedLimit = normalizeLimit(input.limit);
    const rows = await this.repo.listChangesAfterSequence({
      accountId: input.accountId,
      tenantId: input.tenantId,
      branchId: input.branchId,
      afterSequence: input.cursorSequence,
      moduleKeys: input.moduleScopes,
      limit: normalizedLimit + 1,
    });

    const hasMore = rows.length > normalizedLimit;
    const changes = hasMore ? rows.slice(0, normalizedLimit) : rows;
    const nextCursorSequence =
      changes.length > 0
        ? changes[changes.length - 1].sequence
        : input.cursorSequence;

    return {
      changes,
      hasMore,
      nextCursorSequence,
    };
  }

  upsertCheckpoint(input: {
    accountId: string;
    deviceId: string;
    tenantId: string;
    branchId: string;
    moduleScopes: readonly V0SyncModuleKey[];
    lastSequence: string;
  }): Promise<V0SyncCheckpointRow> {
    const moduleScopeHash = buildModuleScopeHash(input.moduleScopes);
    return this.repo.upsertCheckpoint({
      accountId: input.accountId,
      deviceId: input.deviceId,
      tenantId: input.tenantId,
      branchId: input.branchId,
      moduleScopeHash,
      lastSequence: input.lastSequence,
    });
  }

  getCheckpoint(input: {
    accountId: string;
    deviceId: string;
    tenantId: string;
    branchId: string;
    moduleScopes: readonly V0SyncModuleKey[];
  }): Promise<V0SyncCheckpointRow | null> {
    const moduleScopeHash = buildModuleScopeHash(input.moduleScopes);
    return this.repo.getCheckpoint({
      accountId: input.accountId,
      deviceId: input.deviceId,
      tenantId: input.tenantId,
      branchId: input.branchId,
      moduleScopeHash,
    });
  }
}

export function normalizeModuleScopes(input: unknown): V0SyncModuleKey[] {
  if (!Array.isArray(input) || input.length === 0) {
    return [...V0_SYNC_MODULE_KEYS];
  }

  const normalized = input
    .map((item) => String(item ?? "").trim())
    .filter((item): item is V0SyncModuleKey =>
      (V0_SYNC_MODULE_KEYS as readonly string[]).includes(item)
    );

  if (normalized.length === 0) {
    return [...V0_SYNC_MODULE_KEYS];
  }

  return [...new Set(normalized)].sort();
}

export function buildModuleScopeHash(moduleScopes: readonly V0SyncModuleKey[]): string {
  const canonical = [...new Set(moduleScopes)].sort();
  return hashJsonPayload(canonical);
}

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value)) {
    return 200;
  }
  const rounded = Math.floor(value);
  if (rounded <= 0) {
    return 200;
  }
  return Math.min(rounded, 1000);
}
