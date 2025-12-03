import { Ok, Err, type Result } from "../../../shared/result.js";
import type {
  CashSessionRepository,
  CashMovementRepository,
} from "../domain/repositories.js";
import type { CashSession } from "../domain/entities.js";
import type { CashSessionClosedV1 } from "../../../shared/events.js";
import type { IEventBus, ITransactionManager } from "./ports.js";

// Close Cash Session
export interface CloseCashSessionInput {
  sessionId: string;
  closedBy: string;
  countedCashUsd: number;
  countedCashKhr: number;
  note?: string;
}

export class CloseCashSessionUseCase {
  constructor(
    private sessionRepo: CashSessionRepository,
    private movementRepo: CashMovementRepository,
    private eventBus: IEventBus,
    private txManager: ITransactionManager
  ) {}

  async execute(
    input: CloseCashSessionInput
  ): Promise<Result<CashSession, string>> {
    const { sessionId, closedBy, countedCashUsd, countedCashKhr, note } = input;

    // Validate counted amounts
    if (countedCashUsd < 0 || countedCashKhr < 0) {
      return Err("Counted cash cannot be negative");
    }

    // Find session
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      return Err("Session not found");
    }
    if (session.status !== "OPEN") {
      return Err("Session is not open");
    }

    try {
      // Calculate variance
      const varianceUsd = countedCashUsd - session.expectedCashUsd;
      const varianceKhr = countedCashKhr - session.expectedCashKhr;

      // Determine status based on variance threshold
      const varianceThreshold = 5; // $5 USD threshold
      const hasSignificantVariance = Math.abs(varianceUsd) > varianceThreshold;
      const status = hasSignificantVariance ? "PENDING_REVIEW" : "CLOSED";

      let updatedSession: CashSession;

      await this.txManager.withTransaction(async (client) => {
        // Update session
        const result = await this.sessionRepo.update(sessionId, {
          status,
          closedBy,
          closedAt: new Date(),
          countedCashUsd,
          countedCashKhr,
          varianceUsd,
          varianceKhr,
          note,
        });

        if (!result) {
          throw new Error("Failed to update session");
        }

        updatedSession = result;

        // Publish event via outbox
        const event: CashSessionClosedV1 = {
          type: "cash.session_closed",
          v: 1,
          tenantId: session.tenantId,
          branchId: session.branchId,
          sessionId: session.id,
          closedBy,
          closedAt: new Date().toISOString(),
          expectedCash: session.expectedCashUsd,
          actualCash: countedCashUsd,
          variance: varianceUsd,
        };
        await this.eventBus.publishViaOutbox(event, client);
      });

      return Ok(updatedSession!);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to close session"
      );
    }
  }
}
