import { Ok, Err, type Result } from "../../../shared/result.js";
import type {
  CashSessionRepository,
  CashMovementRepository,
} from "../domain/repositories.js";
import type { CashSession } from "../domain/entities.js";
import type { CashSessionClosedV1 } from "../../../shared/events.js";
import type { IEventBus, ITransactionManager } from "./ports.js";
import type { AuditWriterPort } from "../../../shared/ports/audit.js";

export interface ForceCloseSessionInput {
  sessionId: string;
  closedBy: string;
  actorRole?: string | null;
  reason: string;
  countedCashUsd?: number;
  countedCashKhr?: number;
  note?: string;
}

export class ForceCloseSessionUseCase {
  constructor(
    private sessionRepo: CashSessionRepository,
    private movementRepo: CashMovementRepository,
    private eventBus: IEventBus,
    private txManager: ITransactionManager,
    private auditWriter: AuditWriterPort
  ) {}

  async execute(
    input: ForceCloseSessionInput
  ): Promise<Result<CashSession, string>> {
    const { sessionId, closedBy, reason, countedCashUsd, countedCashKhr, note } =
      input;

    if (!reason || reason.trim().length < 3) {
      return Err("Reason must be at least 3 characters");
    }

    if (
      (countedCashUsd !== undefined && countedCashUsd < 0) ||
      (countedCashKhr !== undefined && countedCashKhr < 0)
    ) {
      return Err("Counted cash cannot be negative");
    }

    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      return Err("Session not found");
    }
    if (session.status !== "OPEN") {
      return Err("Session is not open");
    }

    const resolvedCountedUsd =
      countedCashUsd !== undefined ? countedCashUsd : session.expectedCashUsd;
    const resolvedCountedKhr =
      countedCashKhr !== undefined ? countedCashKhr : session.expectedCashKhr;

    const varianceUsd = resolvedCountedUsd - session.expectedCashUsd;
    const varianceKhr = resolvedCountedKhr - session.expectedCashKhr;

    const varianceThreshold = 5;
    const hasSignificantVariance = Math.abs(varianceUsd) > varianceThreshold;
    const status = hasSignificantVariance ? "PENDING_REVIEW" : "CLOSED";

    try {
      let updatedSession: CashSession;

      await this.txManager.withTransaction(async (client) => {
        const result = await this.sessionRepo.update(
          sessionId,
          {
            status,
            closedBy,
            closedAt: new Date(),
            countedCashUsd: resolvedCountedUsd,
            countedCashKhr: resolvedCountedKhr,
            varianceUsd,
            varianceKhr,
            note: note ?? null,
          },
          client
        );

        if (!result) {
          throw new Error("Failed to update session");
        }

        updatedSession = result;

        await this.auditWriter.write(
          {
            tenantId: session.tenantId,
            branchId: session.branchId,
            employeeId: closedBy,
            actorRole: input.actorRole ?? null,
            actionType: "CASH_SESSION_FORCE_CLOSED",
            resourceType: "cash_session",
            resourceId: session.id,
            details: {
              reason: reason.trim(),
              status,
              expectedCashUsd: session.expectedCashUsd,
              expectedCashKhr: session.expectedCashKhr,
              countedCashUsd: resolvedCountedUsd,
              countedCashKhr: resolvedCountedKhr,
              varianceUsd,
              varianceKhr,
              note: note ?? null,
              countedProvided:
                countedCashUsd !== undefined || countedCashKhr !== undefined,
            },
          },
          client
        );

        const event: CashSessionClosedV1 = {
          type: "cash.session_closed",
          v: 1,
          tenantId: session.tenantId,
          branchId: session.branchId,
          sessionId: session.id,
          closedBy,
          closedAt: new Date().toISOString(),
          expectedCash: session.expectedCashUsd,
          actualCash: resolvedCountedUsd,
          variance: varianceUsd,
        };
        await this.eventBus.publishViaOutbox(event, client);
      });

      return Ok(updatedSession!);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to force-close session"
      );
    }
  }
}

