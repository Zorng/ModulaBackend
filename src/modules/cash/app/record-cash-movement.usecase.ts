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
import type { CashMovementRecordedV1 } from "../../../shared/events.js";
import type { IEventBus, ITransactionManager } from "./ports.js";
import type { CashPolicyService } from "./policy-service.js";

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
    private txManager: ITransactionManager,
    private policyService: CashPolicyService
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

    // Check policy for movement type
    if (type === "PAID_OUT") {
      const allowPaidOut = await this.policyService.allowPaidOut(tenantId);
      if (!allowPaidOut) {
        return Err("Paid-out operations are not allowed by tenant policy");
      }
    }

    if (type === "ADJUSTMENT") {
      const allowAdjustment = await this.policyService.allowManualAdjustment(tenantId);
      if (!allowAdjustment) {
        return Err("Manual adjustments are not allowed by tenant policy");
      }
    }

    // Check paid-out limits
    if (type === "PAID_OUT" && !requiresApproval) {
      const limits = await this.policyService.getPaidOutLimit(tenantId);
      if (amountUsd > limits.usd || amountKhr > limits.khr) {
        return Err(
          `Paid-out amount exceeds limit ($${limits.usd} USD / ${limits.khr} KHR). Manager approval required.`
        );
      }
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
      // Determine status based on approval requirements
      let status: CashMovementStatus = "APPROVED";

      // Check if refund requires approval
      if (type === "REFUND_CASH") {
        const requiresRefundApproval = await this.policyService.requireRefundApproval(tenantId);
        if (requiresRefundApproval) {
          status = "PENDING";
        }
      }

      // Override with explicit approval requirement
      if (requiresApproval) {
        status = "PENDING";
      }

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
        const event: CashMovementRecordedV1 = {
          type: `cash.${type.toLowerCase()}` as CashMovementRecordedV1["type"],
          v: 1,
          tenantId,
          branchId,
          sessionId,
          movementId: movement.id,
          movementType: type,
          actorId,
          amountUsd,
          amountKhr,
          reason,
          status,
          timestamp: new Date().toISOString(),
        };
        await this.eventBus.publishViaOutbox(event, client);
      });

      return Ok(movement!);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to record movement"
      );
    }
  }
}
