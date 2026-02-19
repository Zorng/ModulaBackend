import type { Pool } from "pg";
import { log } from "#logger";
import { V0MediaUploadRepository } from "./repository.js";
import { deleteObjectFromR2 } from "../storage/r2-image-storage.js";

type DispatcherInput = {
  db: Pool;
  pollIntervalMs?: number;
  batchSize?: number;
  pendingAgeMinutes?: number;
};

type DispatcherStatus = {
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
};

export function startV0MediaUploadCleanupDispatcher(input: DispatcherInput): {
  stop: () => void;
  getStatus: () => DispatcherStatus;
} {
  const pollIntervalMs = input.pollIntervalMs ?? 60_000;
  const batchSize = input.batchSize ?? 100;
  const pendingAgeMinutes = input.pendingAgeMinutes ?? 24 * 60;

  const status: DispatcherStatus = {
    pollIntervalMs,
    batchSize,
    pendingAgeMinutes,
    lastTickAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
    lastClaimedCount: 0,
    lastDeletedCount: 0,
    lastFailedCount: 0,
  };

  const timer = setInterval(async () => {
    const tickStartedAtMs = Date.now();
    status.lastTickAt = new Date(tickStartedAtMs).toISOString();

    try {
      const repo = new V0MediaUploadRepository(input.db);
      const claimed = await repo.claimStalePendingUploads({
        pendingAgeMinutes,
        batchSize,
      });

      let deletedCount = 0;
      let failedCount = 0;

      for (const upload of claimed) {
        try {
          await deleteObjectFromR2({ objectKey: upload.object_key });
          await repo.markDeleted(upload.id);
          deletedCount += 1;
        } catch (error) {
          await repo.markPending(upload.id);
          failedCount += 1;
          log.error("media.cleanup.delete_failed", {
            event: "media.cleanup.delete_failed",
            uploadId: upload.id,
            tenantId: upload.tenant_id,
            area: upload.area,
            objectKey: upload.object_key,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      status.lastClaimedCount = claimed.length;
      status.lastDeletedCount = deletedCount;
      status.lastFailedCount = failedCount;
      status.lastSuccessAt = new Date().toISOString();
      status.lastError = null;

      if (claimed.length > 0 || failedCount > 0) {
        log.info("media.cleanup.tick_completed", {
          event: "media.cleanup.tick_completed",
          claimedCount: claimed.length,
          deletedCount,
          failedCount,
          pendingAgeMinutes,
          durationMs: Date.now() - tickStartedAtMs,
        });
      }
    } catch (error) {
      status.lastFailureAt = new Date().toISOString();
      status.lastError = error instanceof Error ? error.message : String(error);
      status.lastClaimedCount = 0;
      status.lastDeletedCount = 0;
      status.lastFailedCount = 0;
      log.error("media.cleanup.tick_failed", {
        event: "media.cleanup.tick_failed",
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - tickStartedAtMs,
      });
    }
  }, pollIntervalMs);

  return {
    stop: () => clearInterval(timer),
    getStatus: () => ({ ...status }),
  };
}
