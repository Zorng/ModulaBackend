import type {
  CashSessionRepository,
  CashRegisterRepository,
  CashMovementRepository,
} from "../domain/repositories.js";

import type {
  SaleFinalizedV1,
  SaleVoidedV1,
  CashSaleRecordedV1,
  CashRefundRecordedV1,
} from "../../../shared/events.js";
import type { IEventBus, ITransactionManager } from "./ports.js";
import type { AuditWriterPort } from "../../../shared/ports/audit.js";

// Event handler: Subscribe to sales.sale_finalized
export class OnSaleFinalizedHandler {
  constructor(
    private sessionRepo: CashSessionRepository,
    private movementRepo: CashMovementRepository,
    private eventBus: IEventBus,
    private txManager: ITransactionManager,
    private auditWriter: AuditWriterPort
  ) {}

  async handle(event: SaleFinalizedV1): Promise<void> {
    try {
      const existingMovements = await this.movementRepo.findBySale(event.saleId);
      const hasSaleCash = existingMovements.some((m) => m.type === "SALE_CASH");
      if (hasSaleCash) {
        return;
      }

      const openSession = await this.sessionRepo.findOpenByUserBranch(
        event.tenantId,
        event.branchId,
        event.actorId
      );

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
        const movement = await this.movementRepo.save({
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
        }, client);

        // Update session expected cash
        await this.sessionRepo.update(openSession.id, {
          expectedCashUsd: openSession.expectedCashUsd + totalCashUsd,
          expectedCashKhr: openSession.expectedCashKhr + totalCashKhr,
        }, client);

        // Publish cash movement event via outbox for audit/reporting
        const cashEvent: CashSaleRecordedV1 = {
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
        };
        await this.eventBus.publishViaOutbox(cashEvent, client);

        await this.auditWriter.write(
          {
            tenantId: event.tenantId,
            branchId: event.branchId,
            employeeId: event.actorId,
            actionType: "CASH_TENDER_ATTACHED_TO_SALE",
            resourceType: "sale",
            resourceId: event.saleId,
            details: {
              sessionId: openSession.id,
              registerId: openSession.registerId ?? null,
              movementId: movement.id,
              amountUsd: totalCashUsd,
              amountKhr: totalCashKhr,
              tenders: cashTenders,
            },
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
    private txManager: ITransactionManager,
    private auditWriter: AuditWriterPort
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
        const movement = await this.movementRepo.save({
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
        }, client);

        // Update session expected cash (reduce by refund amount)
        if (session.status === "OPEN") {
          await this.sessionRepo.update(session.id, {
            expectedCashUsd: session.expectedCashUsd - cashMovement.amountUsd,
            expectedCashKhr: session.expectedCashKhr - cashMovement.amountKhr,
          }, client);
        }

        // Publish refund event via outbox for audit/reporting
        const refundEvent: CashRefundRecordedV1 = {
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
        };
        await this.eventBus.publishViaOutbox(refundEvent, client);

        await this.auditWriter.write(
          {
            tenantId: event.tenantId,
            branchId: event.branchId,
            employeeId: event.actorId,
            actionType: "CASH_REFUND_APPROVED",
            resourceType: "sale",
            resourceId: event.saleId,
            details: {
              sessionId: cashMovement.sessionId,
              registerId: cashMovement.registerId ?? null,
              movementId: movement.id,
              amountUsd: cashMovement.amountUsd,
              amountKhr: cashMovement.amountKhr,
              reason: event.reason,
            },
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
