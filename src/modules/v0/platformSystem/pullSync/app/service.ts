import { hashJsonPayload } from "../../../../../shared/utils/hash.js";
import {
  V0_PULL_SYNC_MODULE_KEYS,
  type V0PullSyncModuleKey,
} from "./command-contract.js";
import {
  V0PullSyncRepository,
  type V0PullSyncCheckpointRow,
  type V0PullSyncChangeRow,
} from "../infra/repository.js";

export class V0PullSyncService {
  constructor(private readonly repo: V0PullSyncRepository) {}

  async pull(input: {
    accountId: string;
    tenantId: string;
    branchId: string;
    cursorSequence: string;
    limit: number;
    moduleScopes: readonly V0PullSyncModuleKey[];
  }): Promise<{
    changes: V0PullSyncChangeRow[];
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
    moduleScopes: readonly V0PullSyncModuleKey[];
    lastSequence: string;
  }): Promise<V0PullSyncCheckpointRow> {
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
    moduleScopes: readonly V0PullSyncModuleKey[];
  }): Promise<V0PullSyncCheckpointRow | null> {
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

export function normalizeModuleScopes(input: unknown): V0PullSyncModuleKey[] {
  if (!Array.isArray(input) || input.length === 0) {
    return [...V0_PULL_SYNC_MODULE_KEYS];
  }

  const normalized = input
    .map((item) => String(item ?? "").trim())
    .filter((item): item is V0PullSyncModuleKey =>
      (V0_PULL_SYNC_MODULE_KEYS as readonly string[]).includes(item)
    );

  if (normalized.length === 0) {
    return [...V0_PULL_SYNC_MODULE_KEYS];
  }

  return [...new Set(normalized)].sort();
}

export function buildModuleScopeHash(
  moduleScopes: readonly V0PullSyncModuleKey[]
): string {
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
