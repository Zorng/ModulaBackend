import { Ok, Err, type Result } from "../../../shared/result.js";
import type {
  CashSessionRepository,
  CashMovementRepository,
} from "../domain/repositories.js";
import type {
  CashSession,
} from "../domain/entities.js";

//  Get Active Session
export interface GetActiveSessionInput {
  registerId: string;
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
      const session = await this.sessionRepo.findOpenByRegister(
        input.registerId
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
