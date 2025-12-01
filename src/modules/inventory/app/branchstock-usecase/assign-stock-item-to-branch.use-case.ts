import { BranchStockRepository } from "../../domain/repositories.js";
import { BranchStock } from "../../domain/entities.js";

export interface AssignStockItemToBranchInput {
  tenantId: string;
  branchId: string;
  stockItemId: string;
  minThreshold: number;
}

export class AssignStockItemToBranchUseCase {
  constructor(private branchStockRepo: BranchStockRepository) {}

  async execute(input: AssignStockItemToBranchInput): Promise<BranchStock> {
    // Check if exists, update or create
    const existing = await this.branchStockRepo.findByBranchAndItem(
      input.branchId,
      input.stockItemId
    );
    if (existing) {
      const updated = await this.branchStockRepo.update(existing.id, {
        minThreshold: input.minThreshold,
      });
      if (!updated) {
        throw new Error("Failed to update BranchStock");
      }
      return updated;
    } else {
      return this.branchStockRepo.save({
        tenantId: input.tenantId,
        branchId: input.branchId,
        stockItemId: input.stockItemId,
        minThreshold: input.minThreshold,
      });
    }
  }
}
