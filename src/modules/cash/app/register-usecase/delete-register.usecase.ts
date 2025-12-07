import { Ok, Err, type Result } from "../../../../shared/result.js";
import type {
  CashRegisterRepository,
  CashSessionRepository,
} from "../../domain/repositories.js";

export interface DeleteRegisterInput {
  registerId: string;
  tenantId: string;
}

export class DeleteRegisterUseCase {
  constructor(
    private registerRepo: CashRegisterRepository,
    private sessionRepo: CashSessionRepository
  ) {}

  async execute(input: DeleteRegisterInput): Promise<Result<void, string>> {
    const { registerId, tenantId } = input;

    // Find register
    const register = await this.registerRepo.findById(registerId);
    if (!register) {
      return Err("Register not found");
    }

    // Verify tenant
    if (register.tenantId !== tenantId) {
      return Err("Register does not belong to this tenant");
    }

    // Check for open sessions
    const openSession = await this.sessionRepo.findOpenByRegister(registerId);
    if (openSession) {
      return Err(
        "Cannot delete register with an open session. Please close the session first."
      );
    }

    try {
      // Soft delete by setting status to INACTIVE
      await this.registerRepo.update(registerId, { status: "INACTIVE" });

      return Ok(undefined);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to delete register"
      );
    }
  }
}
