import type { Pool } from "pg";
import { log } from "#logger";
import { TransactionManager } from "../../../../../platform/db/transactionManager.js";
import {
  buildV0KhqrPaymentProviderFromEnv,
  getV0KhqrRuntimeDiagnosticsFromEnv,
} from "./payment-provider.js";
import { V0KhqrPaymentService } from "./service.js";
import { V0KhqrPaymentRepository } from "../infra/repository.js";
import { V0_KHQR_PAYMENT_ACTION_KEYS } from "./command-contract.js";
import { formatError } from "../../../../../platform/errors/format.js";

type DispatcherInput = {
  db: Pool;
  pollIntervalMs?: number;
  batchSize?: number;
  recheckWindowMinutes?: number;
};

type DispatcherStatus = {
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
};

export function startV0KhqrReconciliationDispatcher(input: DispatcherInput): {
  stop: () => void;
  getStatus: () => DispatcherStatus;
} {
  const pollIntervalMs = input.pollIntervalMs ?? 30_000;
  const batchSize = input.batchSize ?? 50;
  const recheckWindowMinutes = input.recheckWindowMinutes ?? 2;
  let tickInFlight = false;

  const status: DispatcherStatus = {
    pollIntervalMs,
    batchSize,
    recheckWindowMinutes,
    lastTickAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
    lastScannedCount: 0,
    lastAppliedCount: 0,
    lastSkippedCount: 0,
    lastFailedCount: 0,
  };

  const provider = buildV0KhqrPaymentProviderFromEnv();
  const providerDiagnostics = getV0KhqrRuntimeDiagnosticsFromEnv();
  const txManager = new TransactionManager(input.db);

  const timer = setInterval(async () => {
    if (tickInFlight) {
      return;
    }
    tickInFlight = true;
    const startedAt = Date.now();
    status.lastTickAt = new Date(startedAt).toISOString();

    try {
      const readRepo = new V0KhqrPaymentRepository(input.db);
      const candidates = await readRepo.listReconciliationCandidates({
        limit: batchSize,
        recheckWindowMinutes,
      });

      let appliedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;

      for (const candidate of candidates) {
        try {
          const result = await txManager.withTransaction(
            async (client) => {
              const service = new V0KhqrPaymentService(
                new V0KhqrPaymentRepository(client),
                provider
              );
              return service.reconcileAttemptById({
                attemptId: candidate.id,
              });
            },
            {
              actionKey: V0_KHQR_PAYMENT_ACTION_KEYS.reconcileScheduler,
              tenantId: candidate.tenant_id,
              branchId: candidate.branch_id,
            }
          );

          if (result.status === "APPLIED") {
            appliedCount += 1;
          } else {
            skippedCount += 1;
          }
        } catch (error) {
          failedCount += 1;
          log.error("khqr.reconcile.attempt_failed", {
            event: "khqr.reconcile.attempt_failed",
            attemptId: candidate.id,
            tenantId: candidate.tenant_id,
            branchId: candidate.branch_id,
            khqrProvider: providerDiagnostics.provider,
            khqrTransport: providerDiagnostics.transport,
            verifyUrlOrigin: providerDiagnostics.verifyUrlOrigin,
            verifyUrlPath: providerDiagnostics.verifyUrlPath,
            verifyProxyConfigured: providerDiagnostics.verifyProxyConfigured,
            verifyProxyUrlOrigin: providerDiagnostics.verifyProxyUrlOrigin,
            verifyProxyUrlPath: providerDiagnostics.verifyProxyUrlPath,
            effectiveVerifyTargetOrigin: providerDiagnostics.effectiveVerifyTargetOrigin,
            effectiveVerifyTargetPath: providerDiagnostics.effectiveVerifyTargetPath,
            apiKeyConfigured: providerDiagnostics.apiKeyConfigured,
            apiKeyHeader: providerDiagnostics.apiKeyHeader,
            apiKeyLength: providerDiagnostics.apiKeyLength,
            apiKeyFingerprint: providerDiagnostics.apiKeyFingerprint,
            apiKeyUsesBearerPrefix: providerDiagnostics.apiKeyUsesBearerPrefix,
            suspectedIssues: providerDiagnostics.suspectedIssues,
            error: formatError(error),
          });
        }
      }

      status.lastScannedCount = candidates.length;
      status.lastAppliedCount = appliedCount;
      status.lastSkippedCount = skippedCount;
      status.lastFailedCount = failedCount;
      status.lastSuccessAt = new Date().toISOString();
      status.lastError = null;

      if (candidates.length > 0 || failedCount > 0) {
        log.info("khqr.reconcile.tick_completed", {
          event: "khqr.reconcile.tick_completed",
          scannedCount: candidates.length,
          appliedCount,
          skippedCount,
          failedCount,
          durationMs: Date.now() - startedAt,
        });
      }
    } catch (error) {
      status.lastFailureAt = new Date().toISOString();
      status.lastError = formatError(error);
      status.lastScannedCount = 0;
      status.lastAppliedCount = 0;
      status.lastSkippedCount = 0;
      status.lastFailedCount = 0;
      log.error("khqr.reconcile.tick_failed", {
        event: "khqr.reconcile.tick_failed",
        error: formatError(error),
        durationMs: Date.now() - startedAt,
      });
    } finally {
      tickInFlight = false;
    }
  }, pollIntervalMs);

  return {
    stop: () => clearInterval(timer),
    getStatus: () => ({ ...status }),
  };
}
