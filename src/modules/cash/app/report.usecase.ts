import { Ok, Err, type Result } from "../../../shared/result.js";
import type {
  CashSessionRepository,
  CashMovementRepository,
} from "../domain/repositories.js";
import type {
  CashSession,
  CashMovement,
} from "../domain/entities.js";


// 6. Generate Z Report
export interface GenerateZReportInput {
  sessionId: string;
}

export interface ZReportData {
  session: CashSession;
  movements: CashMovement[];
  summary: {
    openingFloatUsd: number;
    openingFloatKhr: number;
    totalSalesCashUsd: number;
    totalSalesCashKhr: number;
    totalPaidInUsd: number;
    totalPaidInKhr: number;
    totalPaidOutUsd: number;
    totalPaidOutKhr: number;
    totalRefundsUsd: number;
    totalRefundsKhr: number;
    expectedCashUsd: number;
    expectedCashKhr: number;
    countedCashUsd: number;
    countedCashKhr: number;
    varianceUsd: number;
    varianceKhr: number;
  };
}

export class GenerateZReportUseCase {
  constructor(
    private sessionRepo: CashSessionRepository,
    private movementRepo: CashMovementRepository
  ) {}

  async execute(
    input: GenerateZReportInput
  ): Promise<Result<ZReportData, string>> {
    try {
      const session = await this.sessionRepo.findById(input.sessionId);
      if (!session) {
        return Err("Session not found");
      }

      const movements = await this.movementRepo.findBySession(input.sessionId);

      // Calculate totals by type
      let totalSalesCashUsd = 0;
      let totalSalesCashKhr = 0;
      let totalPaidInUsd = 0;
      let totalPaidInKhr = 0;
      let totalPaidOutUsd = 0;
      let totalPaidOutKhr = 0;
      let totalRefundsUsd = 0;
      let totalRefundsKhr = 0;

      for (const movement of movements) {
        if (movement.status !== "APPROVED") continue;

        switch (movement.type) {
          case "SALE_CASH":
            totalSalesCashUsd += movement.amountUsd;
            totalSalesCashKhr += movement.amountKhr;
            break;
          case "PAID_IN":
            totalPaidInUsd += movement.amountUsd;
            totalPaidInKhr += movement.amountKhr;
            break;
          case "PAID_OUT":
            totalPaidOutUsd += movement.amountUsd;
            totalPaidOutKhr += movement.amountKhr;
            break;
          case "REFUND_CASH":
            totalRefundsUsd += movement.amountUsd;
            totalRefundsKhr += movement.amountKhr;
            break;
        }
      }

      const report: ZReportData = {
        session,
        movements,
        summary: {
          openingFloatUsd: session.openingFloatUsd,
          openingFloatKhr: session.openingFloatKhr,
          totalSalesCashUsd,
          totalSalesCashKhr,
          totalPaidInUsd,
          totalPaidInKhr,
          totalPaidOutUsd,
          totalPaidOutKhr,
          totalRefundsUsd,
          totalRefundsKhr,
          expectedCashUsd: session.expectedCashUsd,
          expectedCashKhr: session.expectedCashKhr,
          countedCashUsd: session.countedCashUsd,
          countedCashKhr: session.countedCashKhr,
          varianceUsd: session.varianceUsd,
          varianceKhr: session.varianceKhr,
        },
      };

      return Ok(report);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to generate Z report"
      );
    }
  }
}

// 7. Generate X Report (Live Summary)
export interface GenerateXReportInput {
  registerId: string;
}

export class GenerateXReportUseCase {
  constructor(
    private sessionRepo: CashSessionRepository,
    private movementRepo: CashMovementRepository
  ) {}

  async execute(
    input: GenerateXReportInput
  ): Promise<Result<ZReportData | null, string>> {
    try {
      const session = await this.sessionRepo.findOpenByRegister(
        input.registerId
      );
      if (!session) {
        return Ok(null);
      }

      // Reuse Z report logic for live summary
      const zReportUseCase = new GenerateZReportUseCase(
        this.sessionRepo,
        this.movementRepo
      );
      return await zReportUseCase.execute({ sessionId: session.id });
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to generate X report"
      );
    }
  }
}