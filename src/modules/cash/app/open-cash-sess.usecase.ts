import { Ok, Err, type Result } from "../../../shared/result.js";
import type {
  CashSessionRepository,
  CashRegisterRepository,
} from "../domain/repositories.js";
import type { CashSession } from "../domain/entities.js";
import type { CashSessionOpenedV1 } from "../../../shared/events.js";
import type { IEventBus, ITransactionManager } from "./ports.js";
import type { AuditWriterPort } from "../../../shared/ports/audit.js";

// ==================== USE CASES ====================

// 1. Open Cash Session
export interface OpenCashSessionInput {
  tenantId: string;
  branchId: string;
  registerId?: string; // Optional for device-agnostic sessions
  openedBy: string;
  actorRole?: string | null;
  openingFloatUsd: number;
  openingFloatKhr: number;
  note?: string;
}

export class OpenCashSessionUseCase {
  constructor(
    private sessionRepo: CashSessionRepository,
    private registerRepo: CashRegisterRepository,
    private eventBus: IEventBus,
    private txManager: ITransactionManager,
    private auditWriter: AuditWriterPort
  ) {}

  async execute(
    input: OpenCashSessionInput
  ): Promise<Result<CashSession, string>> {
    const {
      tenantId,
      branchId,
      registerId,
      openedBy,
      openingFloatUsd,
      openingFloatKhr,
      note,
    } = input;

    // Validate register if provided
    if (registerId) {
      const existingForUser = await this.sessionRepo.findOpenByUserBranch(
        tenantId,
        branchId,
        openedBy
      );
      if (existingForUser) {
        return Err(
          "You already have an open session for this branch. Close it before opening another."
        );
      }

      const register = await this.registerRepo.findById(registerId);
      if (!register) {
        return Err("Register not found");
      }
      if (register.status !== "ACTIVE") {
        return Err("Register is not active");
      }
      if (register.tenantId !== tenantId || register.branchId !== branchId) {
        return Err("Register does not belong to this tenant/branch");
      }

      // Check for existing open session on this register
      const existingSession = await this.sessionRepo.findOpenByRegister(
        registerId
      );
      if (existingSession) {
        return Err(
          "A session is already open on this register. Close it or force-close first."
        );
      }
    } else {
      // For device-agnostic sessions, enforce at most one OPEN session per user per branch.
      const existingSession = await this.sessionRepo.findOpenByUserBranch(
        tenantId,
        branchId,
        openedBy
      );
      if (existingSession) {
        return Err(
          "You already have an open session for this branch. Close it before opening another."
        );
      }
    }

    // Validate opening float
    if (openingFloatUsd < 0 || openingFloatKhr < 0) {
      return Err("Opening float cannot be negative");
    }

    try {
      let session: CashSession;

      await this.txManager.withTransaction(async (client) => {
        // Create new session
        session = await this.sessionRepo.save({
          tenantId,
          branchId,
          registerId,
          openedBy,
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
          note,
        }, client);

        await this.auditWriter.write(
          {
            tenantId,
            branchId,
            employeeId: openedBy,
            actorRole: input.actorRole ?? null,
            actionType: "CASH_SESSION_OPENED",
            resourceType: "cash_session",
            resourceId: session.id,
            details: {
              registerId: registerId ?? null,
              openingFloatUsd,
              openingFloatKhr,
              note: note ?? null,
            },
          },
          client
        );

        // Publish event via outbox
        const event: CashSessionOpenedV1 = {
          type: "cash.session_opened",
          v: 1,
          tenantId,
          branchId,
          sessionId: session.id,
          openedBy,
          openingFloat: openingFloatUsd, // Primary currency for event
          openedAt: session.openedAt.toISOString(),
        };
        await this.eventBus.publishViaOutbox(event, client);
      });

      return Ok(session!);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to open session"
      );
    }
  }
}
