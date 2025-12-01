import { Ok, Err, type Result } from "../../../../shared/result.js";
import {
  BranchStockRepository,
  StockItemRepository,
} from "../../domain/repositories.js";
import { BranchStock } from "../../domain/entities.js";

export interface AssignStockItemToBranchInput {
  tenantId: string;
  branchId: string;
  stockItemId: string;
  minThreshold: number;
  userId: string;
}

export class AssignStockItemToBranchUseCase {
  constructor(
    private branchStockRepo: BranchStockRepository,
    private stockItemRepo: StockItemRepository
  ) {}

  async execute(
    input: AssignStockItemToBranchInput
  ): Promise<Result<BranchStock, string>> {
    const { tenantId, branchId, stockItemId, minThreshold, userId } = input;

    // Validation: minThreshold must be >= 0
    if (minThreshold < 0) {
      return Err("Minimum threshold cannot be negative");
    }

    // Verify stock item exists
    const stockItem = await this.stockItemRepo.findById(stockItemId);
    if (!stockItem) {
      return Err("Stock item not found");
    }

    // Verify stock item belongs to the same tenant
    if (stockItem.tenantId !== tenantId) {
      return Err("Stock item does not belong to this tenant");
    }

    try {
      // The repository's save method handles upsert via ON CONFLICT
      const branchStock = await this.branchStockRepo.save({
        tenantId,
        branchId,
        stockItemId,
        minThreshold,
        createdBy: userId,
      });

      return Ok(branchStock);
    } catch (error) {
      return Err(
        error instanceof Error
          ? error.message
          : "Failed to assign stock item to branch"
      );
    }
  }
}
