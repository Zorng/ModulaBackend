import type {
  CashSessionRepository,
  CashRegisterRepository,
  CashMovementRepository,
} from "../domain/repositories.js";

import type { SaleFinalizedV1, SaleVoidedV1 } from "../../../shared/events.js";
import type { IEventBus, ITransactionManager } from "./ports.js";

// Event handler: Subscribe to sales.sale_finalized
export class OnSaleFinalizedHandler {
  constructor(
    private sessionRepo: CashSessionRepository,
    private movementRepo: CashMovementRepository,
    private eventBus: IEventBus,
    private txManager: ITransactionManager
  ) {}

  async handle(event: SaleFinalizedV1): Promise<void> {
    try {
      // Find active session for this branch (assuming register mapping exists)
      // For now, we'll need to find any open session in the branch
      const sessions = await this.sessionRepo.findByBranch(event.branchId);
      const openSession = sessions.find((s) => s.status === "OPEN");

      if (!openSession) {
        // No open session - skip (cash policy may not require it for non-cash sales)
        return;
      }

      // Check if payment includes cash
      const cashTenders = event.tenders.filter((t) => t.method === "CASH");
      if (cashTenders.length === 0) {
        return; // No cash payment
      }

      // Sum up cash amounts
      const totalCashUsd = cashTenders.reduce((sum, t) => sum + t.amountUsd, 0);
      const totalCashKhr = cashTenders.reduce((sum, t) => sum + t.amountKhr, 0);

      // Use transaction to ensure atomicity
      await this.txManager.withTransaction(async (client) => {
        // Create cash movement
        await this.movementRepo.save({
          tenantId: event.tenantId,
          branchId: event.branchId,
          registerId: openSession.registerId,
          sessionId: openSession.id,
          actorId: event.actorId,
          type: "SALE_CASH",
          status: "APPROVED",
          amountUsd: totalCashUsd,
          amountKhr: totalCashKhr,
          refSaleId: event.saleId,
          reason: `Sale ${event.saleId}`,
        });

        // Update session expected cash
        await this.sessionRepo.update(openSession.id, {
          expectedCashUsd: openSession.expectedCashUsd + totalCashUsd,
          expectedCashKhr: openSession.expectedCashKhr + totalCashKhr,
        });

        // Publish cash movement event via outbox for audit/reporting
        await this.eventBus.publishViaOutbox(
          {
            type: "cash.sale_cash_recorded",
            v: 1,
            tenantId: event.tenantId,
            branchId: event.branchId,
            sessionId: openSession.id,
            registerId: openSession.registerId,
            saleId: event.saleId,
            amountUsd: totalCashUsd,
            amountKhr: totalCashKhr,
            timestamp: new Date().toISOString(),
          },
          client
        );
      });
    } catch (error) {
      console.error("Error handling sale finalized event:", error);
      // Re-throw to trigger retry via outbox
      throw error;
    }
  }
}

// Event handler: Subscribe to sales.sale_voided
export class OnSaleVoidedHandler {
  constructor(
    private sessionRepo: CashSessionRepository,
    private movementRepo: CashMovementRepository,
    private eventBus: IEventBus,
    private txManager: ITransactionManager
  ) {}

  async handle(event: SaleVoidedV1): Promise<void> {
    try {
      // Find the original cash movement for this sale
      const movements = await this.movementRepo.findBySale(event.saleId);
      const cashMovement = movements.find((m) => m.type === "SALE_CASH");

      if (!cashMovement) {
        return; // No cash movement to void
      }

      // Find session
      const session = await this.sessionRepo.findById(cashMovement.sessionId);
      if (!session) {
        return;
      }

      // Use transaction to ensure atomicity
      await this.txManager.withTransaction(async (client) => {
        // Create refund movement
        await this.movementRepo.save({
          tenantId: event.tenantId,
          branchId: event.branchId,
          registerId: cashMovement.registerId,
          sessionId: cashMovement.sessionId,
          actorId: event.actorId,
          type: "REFUND_CASH",
          status: "APPROVED",
          amountUsd: cashMovement.amountUsd,
          amountKhr: cashMovement.amountKhr,
          refSaleId: event.saleId,
          reason: `Void sale ${event.saleId}: ${event.reason}`,
        });

        // Update session expected cash (reduce by refund amount)
        if (session.status === "OPEN") {
          await this.sessionRepo.update(session.id, {
            expectedCashUsd: session.expectedCashUsd - cashMovement.amountUsd,
            expectedCashKhr: session.expectedCashKhr - cashMovement.amountKhr,
          });
        }

        // Publish refund event via outbox for audit/reporting
        await this.eventBus.publishViaOutbox(
          {
            type: "cash.refund_cash_recorded",
            v: 1,
            tenantId: event.tenantId,
            branchId: event.branchId,
            sessionId: cashMovement.sessionId,
            registerId: cashMovement.registerId,
            saleId: event.saleId,
            amountUsd: cashMovement.amountUsd,
            amountKhr: cashMovement.amountKhr,
            reason: event.reason,
            timestamp: new Date().toISOString(),
          },
          client
        );
      });
    } catch (error) {
      console.error("Error handling sale voided event:", error);
      // Re-throw to trigger retry via outbox
      throw error;
    }
  }
}
