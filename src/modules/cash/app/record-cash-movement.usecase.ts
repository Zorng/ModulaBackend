import { Ok, Err, type Result } from "../../../shared/result.js";
import type {
  CashSessionRepository,
  CashMovementRepository,
} from "../domain/repositories.js";
import type {
  CashMovement,
  CashMovementType,
  CashMovementStatus,
} from "../domain/entities.js";
import type { IEventBus, ITransactionManager } from "./ports.js";

//Record Manual Cash Movement (Paid In/Out, Adjustment)

export interface RecordCashMovementInput {
  tenantId: string;
  branchId: string;
  registerId: string;
  sessionId: string;
  actorId: string;
  type: CashMovementType;
  amountUsd: number;
  amountKhr: number;
  reason: string;
  requiresApproval?: boolean;
}

export class RecordCashMovementUseCase {
  constructor(
    private sessionRepo: CashSessionRepository,
    private movementRepo: CashMovementRepository,
    private eventBus: IEventBus,
    private txManager: ITransactionManager
  ) {}

  async execute(
    input: RecordCashMovementInput
  ): Promise<Result<CashMovement, string>> {
    const {
      tenantId,
      branchId,
      registerId,
      sessionId,
      actorId,
      type,
      amountUsd,
      amountKhr,
      reason,
      requiresApproval = false,
    } = input;

    // Validate reason
    if (!reason || reason.trim().length < 3 || reason.trim().length > 120) {
      return Err("Reason must be between 3 and 120 characters");
    }

    // Validate amounts
    if (amountUsd < 0 || amountKhr < 0) {
      return Err("Amount cannot be negative");
    }

    // Find session and validate it's open
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      return Err("Session not found");
    }
    if (session.status !== "OPEN") {
      return Err("Session is not open. Cannot record movements.");
    }

    try {
      // Determine status
      const status: CashMovementStatus = requiresApproval
        ? "PENDING"
        : "APPROVED";

      let movement: CashMovement;

      await this.txManager.withTransaction(async (client) => {
        // Create movement
        movement = await this.movementRepo.save({
          tenantId,
          branchId,
          registerId,
          sessionId,
          actorId,
          type,
          status,
          amountUsd,
          amountKhr,
          reason: reason.trim(),
        });

        // Update session expected cash if approved
        if (status === "APPROVED") {
          let newExpectedUsd = session.expectedCashUsd;
          let newExpectedKhr = session.expectedCashKhr;

          switch (type) {
            case "PAID_IN":
              newExpectedUsd += amountUsd;
              newExpectedKhr += amountKhr;
              break;
            case "PAID_OUT":
            case "REFUND_CASH":
              newExpectedUsd -= amountUsd;
              newExpectedKhr -= amountKhr;
              break;
            case "ADJUSTMENT":
              // Can be positive or negative (use sign of amount)
              newExpectedUsd += amountUsd;
              newExpectedKhr += amountKhr;
              break;
          }

          await this.sessionRepo.update(sessionId, {
            expectedCashUsd: newExpectedUsd,
            expectedCashKhr: newExpectedKhr,
          });
        }

        // Publish activity event via outbox
        await this.eventBus.publishViaOutbox(
          {
            type: `cash.${type.toLowerCase()}`,
            v: 1,
            tenantId,
            branchId,
            sessionId,
            movementId: movement.id,
            actorId,
            amountUsd,
            amountKhr,
            reason,
            status,
            timestamp: new Date().toISOString(),
          },
          client
        );
      });

      return Ok(movement!);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to record movement"
      );
    }
  }
}
