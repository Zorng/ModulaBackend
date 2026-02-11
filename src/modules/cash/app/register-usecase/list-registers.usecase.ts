import type { CashRegisterRepository } from "../../domain/repositories.js";
import type { CashRegister } from "../../domain/entities.js";

export interface ListRegistersInput {
  tenantId: string;
  branchId: string;
  includeInactive?: boolean;
}

export class ListRegistersUseCase {
  constructor(private registerRepo: CashRegisterRepository) {}

  async execute(input: ListRegistersInput): Promise<CashRegister[]> {
    const { tenantId, branchId, includeInactive = false } = input;

    const registers = await this.registerRepo.findByBranch(branchId);

    // Filter by status if needed
    if (!includeInactive) {
      return registers.filter((r) => r.status === "ACTIVE");
    }

    return registers;
  }
}
