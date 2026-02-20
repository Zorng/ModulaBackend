import type { Pool } from "pg";
import { log } from "#logger";
import { startV0CommandOutboxDispatcher } from "../outbox/dispatcher.js";
import { startV0MediaUploadCleanupDispatcher } from "../media-uploads/cleanup-dispatcher.js";
import { startV0KhqrReconciliationDispatcher } from "#modules/v0/platformSystem/khqrPayment/index.js";

type OutboxDispatcher = ReturnType<typeof startV0CommandOutboxDispatcher>;
type MediaCleanupDispatcher = ReturnType<typeof startV0MediaUploadCleanupDispatcher>;
type KhqrReconciliationDispatcher = ReturnType<typeof startV0KhqrReconciliationDispatcher>;

export type RuntimeDispatchers = {
  outbox: {
    enabled: boolean;
    pollIntervalMs: number;
    batchSize: number;
    healthStaleMs: number;
    dispatcher: OutboxDispatcher | null;
  };
  mediaCleanup: {
    requested: boolean;
    enabled: boolean;
    isR2Configured: boolean;
    pollIntervalMs: number;
    batchSize: number;
    pendingAgeMinutes: number;
    healthStaleMs: number;
    dispatcher: MediaCleanupDispatcher | null;
  };
  khqrReconciliation: {
    enabled: boolean;
    pollIntervalMs: number;
    batchSize: number;
    recheckWindowMinutes: number;
    healthStaleMs: number;
    dispatcher: KhqrReconciliationDispatcher | null;
  };
};

export function createRuntimeDispatchers(db: Pool): RuntimeDispatchers {
  const outboxEnabled = process.env.V0_OUTBOX_DISPATCHER_ENABLED !== "false";
  const outboxPollIntervalMs = toNumberOrDefault(
    process.env.V0_OUTBOX_DISPATCHER_INTERVAL_MS,
    1000
  );
  const outboxBatchSize = toNumberOrDefault(process.env.V0_OUTBOX_DISPATCHER_BATCH_SIZE, 100);
  const outboxHealthStaleMs = toNumberOrDefault(
    process.env.V0_OUTBOX_HEALTH_STALE_MS,
    outboxPollIntervalMs * 5
  );

  const outboxDispatcher = outboxEnabled
    ? startV0CommandOutboxDispatcher({
        db,
        pollIntervalMs: outboxPollIntervalMs,
        batchSize: outboxBatchSize,
      })
    : null;

  const isR2Configured =
    Boolean(process.env.R2_ACCOUNT_ID) &&
    Boolean(process.env.R2_ACCESS_KEY_ID) &&
    Boolean(process.env.R2_SECRET_ACCESS_KEY) &&
    Boolean(process.env.R2_BUCKET_NAME);
  const mediaCleanupRequested = process.env.V0_MEDIA_CLEANUP_ENABLED !== "false";
  const mediaCleanupEnabled = mediaCleanupRequested && isR2Configured;
  const mediaCleanupPollIntervalMs = toNumberOrDefault(
    process.env.V0_MEDIA_CLEANUP_INTERVAL_MS,
    60_000
  );
  const mediaCleanupBatchSize = toNumberOrDefault(process.env.V0_MEDIA_CLEANUP_BATCH_SIZE, 100);
  const mediaCleanupPendingAgeMinutes = toNumberOrDefault(
    process.env.V0_MEDIA_CLEANUP_PENDING_AGE_MINUTES,
    24 * 60
  );
  const mediaCleanupHealthStaleMs = toNumberOrDefault(
    process.env.V0_MEDIA_CLEANUP_HEALTH_STALE_MS,
    mediaCleanupPollIntervalMs * 5
  );

  const mediaCleanupDispatcher = mediaCleanupEnabled
    ? startV0MediaUploadCleanupDispatcher({
        db,
        pollIntervalMs: mediaCleanupPollIntervalMs,
        batchSize: mediaCleanupBatchSize,
        pendingAgeMinutes: mediaCleanupPendingAgeMinutes,
      })
    : null;

  const khqrReconciliationEnabled = process.env.V0_KHQR_RECONCILIATION_ENABLED !== "false";
  const khqrReconciliationPollIntervalMs = toNumberOrDefault(
    process.env.V0_KHQR_RECONCILIATION_INTERVAL_MS,
    30_000
  );
  const khqrReconciliationBatchSize = toNumberOrDefault(
    process.env.V0_KHQR_RECONCILIATION_BATCH_SIZE,
    50
  );
  const khqrReconciliationRecheckWindowMinutes = toNumberOrDefault(
    process.env.V0_KHQR_RECONCILIATION_RECHECK_WINDOW_MINUTES,
    2
  );
  const khqrReconciliationHealthStaleMs = toNumberOrDefault(
    process.env.V0_KHQR_RECONCILIATION_HEALTH_STALE_MS,
    khqrReconciliationPollIntervalMs * 5
  );

  const khqrReconciliationDispatcher = khqrReconciliationEnabled
    ? startV0KhqrReconciliationDispatcher({
        db,
        pollIntervalMs: khqrReconciliationPollIntervalMs,
        batchSize: khqrReconciliationBatchSize,
        recheckWindowMinutes: khqrReconciliationRecheckWindowMinutes,
      })
    : null;

  return {
    outbox: {
      enabled: outboxEnabled,
      pollIntervalMs: outboxPollIntervalMs,
      batchSize: outboxBatchSize,
      healthStaleMs: outboxHealthStaleMs,
      dispatcher: outboxDispatcher,
    },
    mediaCleanup: {
      requested: mediaCleanupRequested,
      enabled: mediaCleanupEnabled,
      isR2Configured,
      pollIntervalMs: mediaCleanupPollIntervalMs,
      batchSize: mediaCleanupBatchSize,
      pendingAgeMinutes: mediaCleanupPendingAgeMinutes,
      healthStaleMs: mediaCleanupHealthStaleMs,
      dispatcher: mediaCleanupDispatcher,
    },
    khqrReconciliation: {
      enabled: khqrReconciliationEnabled,
      pollIntervalMs: khqrReconciliationPollIntervalMs,
      batchSize: khqrReconciliationBatchSize,
      recheckWindowMinutes: khqrReconciliationRecheckWindowMinutes,
      healthStaleMs: khqrReconciliationHealthStaleMs,
      dispatcher: khqrReconciliationDispatcher,
    },
  };
}

export function logRuntimeDispatchersStarted(dispatchers: RuntimeDispatchers): void {
  if (dispatchers.outbox.enabled) {
    log.info("outbox.dispatcher.started", {
      event: "outbox.dispatcher.started",
      pollIntervalMs: dispatchers.outbox.pollIntervalMs,
      batchSize: dispatchers.outbox.batchSize,
    });
  }

  if (dispatchers.mediaCleanup.enabled) {
    log.info("media.cleanup.started", {
      event: "media.cleanup.started",
      pollIntervalMs: dispatchers.mediaCleanup.pollIntervalMs,
      batchSize: dispatchers.mediaCleanup.batchSize,
      pendingAgeMinutes: dispatchers.mediaCleanup.pendingAgeMinutes,
    });
  } else if (dispatchers.mediaCleanup.requested && !dispatchers.mediaCleanup.isR2Configured) {
    log.info("media.cleanup.skipped", {
      event: "media.cleanup.skipped",
      reason: "R2_NOT_CONFIGURED",
    });
  }

  if (dispatchers.khqrReconciliation.enabled) {
    log.info("khqr.reconciliation.started", {
      event: "khqr.reconciliation.started",
      pollIntervalMs: dispatchers.khqrReconciliation.pollIntervalMs,
      batchSize: dispatchers.khqrReconciliation.batchSize,
      recheckWindowMinutes: dispatchers.khqrReconciliation.recheckWindowMinutes,
    });
  }
}

export function stopRuntimeDispatchers(dispatchers: RuntimeDispatchers): void {
  dispatchers.outbox.dispatcher?.stop();
  dispatchers.mediaCleanup.dispatcher?.stop();
  dispatchers.khqrReconciliation.dispatcher?.stop();
}

function toNumberOrDefault(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}
