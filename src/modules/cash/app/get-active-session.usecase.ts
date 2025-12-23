import { Ok, Err, type Result } from "../../../shared/result.js";
import type {
  CashSessionRepository,
  CashMovementRepository,
} from "../domain/repositories.js";
import type { CashSession } from "../domain/entities.js";

//  Get Active Session
export interface GetActiveSessionInput {
  tenantId: string;
  branchId: string;
  registerId?: string; // Optional for branch-level session lookup
  openedBy: string;
}

export class GetActiveSessionUseCase {
  constructor(
    private sessionRepo: CashSessionRepository,
    private movementRepo: CashMovementRepository
  ) {}

  async execute(
    input: GetActiveSessionInput
  ): Promise<Result<CashSession | null, string>> {
    try {
      // Find session by register if provided, otherwise by branch
      const session = input.registerId
        ? await this.sessionRepo.findOpenByUserRegister(
            input.tenantId,
            input.registerId,
            input.openedBy
          )
        : await this.sessionRepo.findOpenByUserBranch(
            input.tenantId,
            input.branchId,
            input.openedBy
          );

      if (!session) {
        return Ok(null);
      }

      // Attach movements
      const movements = await this.movementRepo.findBySession(session.id);
      session.movements = movements;

      return Ok(session);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to get active session"
      );
    }
  }
}
