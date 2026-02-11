import { Ok, Err, type Result } from "../../../../shared/result.js";
import type { CashRegisterRepository } from "../../domain/repositories.js";
import type { CashRegister } from "../../domain/entities.js";

export interface CreateRegisterInput {
  tenantId: string;
  branchId: string;
  name: string;
  createdBy: string;
}

export class CreateRegisterUseCase {
  constructor(private registerRepo: CashRegisterRepository) {}

  async execute(
    input: CreateRegisterInput
  ): Promise<Result<CashRegister, string>> {
    const { tenantId, branchId, name, createdBy } = input;

    // Validate name
    if (!name || name.trim().length < 2 || name.trim().length > 100) {
      return Err("Register name must be between 2 and 100 characters");
    }

    // Check for duplicate name in the same branch
    const existing = await this.registerRepo.findByBranchAndName(
      branchId,
      name.trim()
    );
    if (existing) {
      return Err("A register with this name already exists in this branch");
    }

    try {
      const register = await this.registerRepo.save({
        tenantId,
        branchId,
        name: name.trim(),
        status: "ACTIVE",
      });

      return Ok(register);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to create register"
      );
    }
  }
}
