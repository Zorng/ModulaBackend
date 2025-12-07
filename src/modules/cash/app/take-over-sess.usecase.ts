import { Ok, Err, type Result } from "../../../shared/result.js";
import type {
  CashSessionRepository,
  CashRegisterRepository,
} from "../domain/repositories.js";
import type { CashSession } from "../domain/entities.js";
import type { CashSessionTakenOverV1 } from "../../../shared/events.js";
import type { IEventBus, ITransactionManager } from "./ports.js";

// 2. Take Over Session (Manager/Admin)
export interface TakeOverSessionInput {
  tenantId: string;
  branchId: string;
  registerId: string;
  newOpenedBy: string;
  reason: string;
  openingFloatUsd: number;
  openingFloatKhr: number;
}

export class TakeOverSessionUseCase {
  constructor(
    private sessionRepo: CashSessionRepository,
    private registerRepo: CashRegisterRepository,
    private eventBus: IEventBus,
    private txManager: ITransactionManager
  ) {}

  async execute(
    input: TakeOverSessionInput
  ): Promise<Result<CashSession, string>> {
    const {
      tenantId,
      branchId,
      registerId,
      newOpenedBy,
      reason,
      openingFloatUsd,
      openingFloatKhr,
    } = input;

    if (!reason || reason.trim().length < 3) {
      return Err("Reason must be at least 3 characters");
    }

    // Find existing open session
    const existingSession = await this.sessionRepo.findOpenByRegister(
      registerId
    );
    if (!existingSession) {
      return Err("No open session found to take over");
    }

    try {
      let newSession: CashSession;

      await this.txManager.withTransaction(async (client) => {
        // Close the old session with note
        await this.sessionRepo.update(existingSession.id, {
          status: "CLOSED",
          closedBy: newOpenedBy,
          closedAt: new Date(),
          note: `Taken over by manager. Reason: ${reason}`,
        });

        // Open new session
        newSession = await this.sessionRepo.save({
          tenantId,
          branchId,
          registerId,
          openedBy: newOpenedBy,
          openedAt: new Date(),
          openingFloatUsd,
          openingFloatKhr,
          status: "OPEN",
          expectedCashUsd: openingFloatUsd,
          expectedCashKhr: openingFloatKhr,
          countedCashUsd: 0,
          countedCashKhr: 0,
          varianceUsd: 0,
          varianceKhr: 0,
          note: `Taken over from previous session. Reason: ${reason}`,
        });

        // Publish take-over event via outbox
        const event: CashSessionTakenOverV1 = {
          type: "cash.session_taken_over",
          v: 1,
          tenantId,
          branchId,
          oldSessionId: existingSession.id,
          newSessionId: newSession.id,
          takenOverBy: newOpenedBy,
          reason,
          timestamp: new Date().toISOString(),
        };
        await this.eventBus.publishViaOutbox(event, client);
      });

      return Ok(newSession!);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to take over session"
      );
    }
  }
}
