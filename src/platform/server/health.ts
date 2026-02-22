export function resolveOutboxHealth(input: {
  enabled: boolean;
  status: {
    pollIntervalMs: number;
    batchSize: number;
    lastTickAt: string | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastError: string | null;
  } | null;
  staleAfterMs: number;
}): {
  status: "ok" | "degraded" | "disabled";
  pollIntervalMs?: number;
  batchSize?: number;
  lastTickAt?: string | null;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  lastError?: string | null;
} {
  if (!input.enabled) {
    return { status: "disabled" };
  }
  if (!input.status) {
    return { status: "degraded" };
  }

  const nowMs = Date.now();
  const lastTickMs = input.status.lastTickAt ? Date.parse(input.status.lastTickAt) : NaN;
  const isStale = Number.isFinite(lastTickMs) ? nowMs - lastTickMs > input.staleAfterMs : true;
  const latestFailureMs = input.status.lastFailureAt
    ? Date.parse(input.status.lastFailureAt)
    : Number.NEGATIVE_INFINITY;
  const latestSuccessMs = input.status.lastSuccessAt
    ? Date.parse(input.status.lastSuccessAt)
    : Number.NEGATIVE_INFINITY;

  const degraded = isStale || latestFailureMs > latestSuccessMs;

  return {
    status: degraded ? "degraded" : "ok",
    pollIntervalMs: input.status.pollIntervalMs,
    batchSize: input.status.batchSize,
    lastTickAt: input.status.lastTickAt,
    lastSuccessAt: input.status.lastSuccessAt,
    lastFailureAt: input.status.lastFailureAt,
    lastError: input.status.lastError,
  };
}

export function resolveMediaCleanupHealth(input: {
  enabled: boolean;
  status: {
    pollIntervalMs: number;
    batchSize: number;
    pendingAgeMinutes: number;
    lastTickAt: string | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastError: string | null;
    lastClaimedCount: number;
    lastDeletedCount: number;
    lastFailedCount: number;
  } | null;
  staleAfterMs: number;
}): {
  status: "ok" | "degraded" | "disabled";
  pollIntervalMs?: number;
  batchSize?: number;
  pendingAgeMinutes?: number;
  lastTickAt?: string | null;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  lastError?: string | null;
  lastClaimedCount?: number;
  lastDeletedCount?: number;
  lastFailedCount?: number;
} {
  if (!input.enabled) {
    return { status: "disabled" };
  }
  if (!input.status) {
    return { status: "degraded" };
  }

  const nowMs = Date.now();
  const lastTickMs = input.status.lastTickAt ? Date.parse(input.status.lastTickAt) : NaN;
  const isStale = Number.isFinite(lastTickMs) ? nowMs - lastTickMs > input.staleAfterMs : true;
  const latestFailureMs = input.status.lastFailureAt
    ? Date.parse(input.status.lastFailureAt)
    : Number.NEGATIVE_INFINITY;
  const latestSuccessMs = input.status.lastSuccessAt
    ? Date.parse(input.status.lastSuccessAt)
    : Number.NEGATIVE_INFINITY;

  const degraded = isStale || latestFailureMs > latestSuccessMs;

  return {
    status: degraded ? "degraded" : "ok",
    pollIntervalMs: input.status.pollIntervalMs,
    batchSize: input.status.batchSize,
    pendingAgeMinutes: input.status.pendingAgeMinutes,
    lastTickAt: input.status.lastTickAt,
    lastSuccessAt: input.status.lastSuccessAt,
    lastFailureAt: input.status.lastFailureAt,
    lastError: input.status.lastError,
    lastClaimedCount: input.status.lastClaimedCount,
    lastDeletedCount: input.status.lastDeletedCount,
    lastFailedCount: input.status.lastFailedCount,
  };
}

export function resolveKhqrReconciliationHealth(input: {
  enabled: boolean;
  status: {
    pollIntervalMs: number;
    batchSize: number;
    recheckWindowMinutes: number;
    lastTickAt: string | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastError: string | null;
    lastScannedCount: number;
    lastAppliedCount: number;
    lastSkippedCount: number;
    lastFailedCount: number;
  } | null;
  staleAfterMs: number;
}): {
  status: "ok" | "degraded" | "disabled";
  pollIntervalMs?: number;
  batchSize?: number;
  recheckWindowMinutes?: number;
  lastTickAt?: string | null;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  lastError?: string | null;
  lastScannedCount?: number;
  lastAppliedCount?: number;
  lastSkippedCount?: number;
  lastFailedCount?: number;
} {
  if (!input.enabled) {
    return { status: "disabled" };
  }
  if (!input.status) {
    return { status: "degraded" };
  }

  const nowMs = Date.now();
  const lastTickMs = input.status.lastTickAt ? Date.parse(input.status.lastTickAt) : NaN;
  const isStale = Number.isFinite(lastTickMs) ? nowMs - lastTickMs > input.staleAfterMs : true;
  const latestFailureMs = input.status.lastFailureAt
    ? Date.parse(input.status.lastFailureAt)
    : Number.NEGATIVE_INFINITY;
  const latestSuccessMs = input.status.lastSuccessAt
    ? Date.parse(input.status.lastSuccessAt)
    : Number.NEGATIVE_INFINITY;
  const degraded = isStale || latestFailureMs > latestSuccessMs;

  return {
    status: degraded ? "degraded" : "ok",
    pollIntervalMs: input.status.pollIntervalMs,
    batchSize: input.status.batchSize,
    recheckWindowMinutes: input.status.recheckWindowMinutes,
    lastTickAt: input.status.lastTickAt,
    lastSuccessAt: input.status.lastSuccessAt,
    lastFailureAt: input.status.lastFailureAt,
    lastError: input.status.lastError,
    lastScannedCount: input.status.lastScannedCount,
    lastAppliedCount: input.status.lastAppliedCount,
    lastSkippedCount: input.status.lastSkippedCount,
    lastFailedCount: input.status.lastFailedCount,
  };
}

export function resolveKhqrWebhookHealth(input: {
  diagnostics: {
    lastIgnoredReason: "NO_MATCH" | "AMBIGUOUS_MD5" | null;
    lastReceivedAt: string | null;
    lastAppliedAt: string | null;
    lastDuplicateAt: string | null;
    lastIgnoredAt: string | null;
    lastUnauthorizedAt: string | null;
    lastInvalidPayloadAt: string | null;
    lastFailedAt: string | null;
    lastError: string | null;
    totalReceived: number;
    totalApplied: number;
    totalDuplicate: number;
    totalIgnored: number;
    totalIgnoredNoMatch: number;
    totalIgnoredAmbiguousMd5: number;
    totalUnauthorized: number;
    totalInvalidPayload: number;
    totalFailed: number;
  };
}): {
  status: "ok";
  lastIgnoredReason: "NO_MATCH" | "AMBIGUOUS_MD5" | null;
  lastReceivedAt: string | null;
  lastAppliedAt: string | null;
  lastDuplicateAt: string | null;
  lastIgnoredAt: string | null;
  lastUnauthorizedAt: string | null;
  lastInvalidPayloadAt: string | null;
  lastFailedAt: string | null;
  lastError: string | null;
  totalReceived: number;
  totalApplied: number;
  totalDuplicate: number;
  totalIgnored: number;
  totalIgnoredNoMatch: number;
  totalIgnoredAmbiguousMd5: number;
  totalUnauthorized: number;
  totalInvalidPayload: number;
  totalFailed: number;
} {
  return {
    status: "ok",
    ...input.diagnostics,
  };
}
