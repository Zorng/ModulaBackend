import { Ok, Err, type Result } from "../../../shared/result.js";
import type {
  CashSessionRepository,
  CashRegisterRepository,
} from "../domain/repositories.js";
import type { CashSession } from "../domain/entities.js";
import type { CashSessionTakenOverV1 } from "../../../shared/events.js";
import type { IEventBus, ITransactionManager } from "./ports.js";
import type { AuditWriterPort } from "../../../shared/ports/audit.js";

// 2. Take Over Session (Manager/Admin)
export interface TakeOverSessionInput {
  tenantId: string;
  branchId: string;
  registerId?: string; // Optional for device-agnostic sessions
  newOpenedBy: string;
  actorRole?: string | null;
  reason: string;
  openingFloatUsd: number;
  openingFloatKhr: number;
}

export class TakeOverSessionUseCase {
  constructor(
    private sessionRepo: CashSessionRepository,
    private registerRepo: CashRegisterRepository,
    private eventBus: IEventBus,
    private txManager: ITransactionManager,
    private auditWriter: AuditWriterPort
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

    if (!registerId) {
      return Err(
        "Takeover without registerId is not supported (cash sessions are per-user). Use force-close instead."
      );
    }

    // Find existing open session (register-specific or branch-level)
    const existingSession = await this.sessionRepo.findOpenByRegister(registerId);

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
        }, client);

        await this.auditWriter.write(
          {
            tenantId,
            branchId,
            employeeId: newOpenedBy,
            actorRole: input.actorRole ?? null,
            actionType: "CASH_SESSION_FORCE_CLOSED",
            resourceType: "cash_session",
            resourceId: existingSession.id,
            details: {
              closureType: "TAKEOVER",
              reason,
              newOpenedBy,
            },
          },
          client
        );

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
        }, client);

        await this.auditWriter.write(
          {
            tenantId,
            branchId,
            employeeId: newOpenedBy,
            actorRole: input.actorRole ?? null,
            actionType: "CASH_SESSION_OPENED",
            resourceType: "cash_session",
            resourceId: newSession.id,
            details: {
              registerId: registerId ?? null,
              openingFloatUsd,
              openingFloatKhr,
              note: `Taken over from previous session. Reason: ${reason}`,
              takenOverFromSessionId: existingSession.id,
            },
          },
          client
        );

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
