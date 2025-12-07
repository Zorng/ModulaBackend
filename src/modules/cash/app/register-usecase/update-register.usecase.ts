import { Ok, Err, type Result } from "../../../../shared/result.js";
import type { CashRegisterRepository } from "../../domain/repositories.js";
import type { CashRegister } from "../../domain/entities.js";

export interface UpdateRegisterInput {
  registerId: string;
  tenantId: string;
  name?: string;
  status?: "ACTIVE" | "INACTIVE";
}

export class UpdateRegisterUseCase {
  constructor(private registerRepo: CashRegisterRepository) {}

  async execute(
    input: UpdateRegisterInput
  ): Promise<Result<CashRegister, string>> {
    const { registerId, tenantId, name, status } = input;

    // Find existing register
    const register = await this.registerRepo.findById(registerId);
    if (!register) {
      return Err("Register not found");
    }

    // Verify tenant
    if (register.tenantId !== tenantId) {
      return Err("Register does not belong to this tenant");
    }

    // Validate name if provided
    if (name !== undefined) {
      if (name.trim().length < 2 || name.trim().length > 100) {
        return Err("Register name must be between 2 and 100 characters");
      }

      // Check for duplicate name
      const existing = await this.registerRepo.findByBranchAndName(
        register.branchId,
        name.trim()
      );
      if (existing && existing.id !== registerId) {
        return Err("A register with this name already exists in this branch");
      }
    }

    try {
      const updated = await this.registerRepo.update(registerId, {
        ...(name !== undefined && { name: name.trim() }),
        ...(status !== undefined && { status }),
      });

      if (!updated) {
        return Err("Failed to update register");
      }

      return Ok(updated);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to update register"
      );
    }
  }
}
