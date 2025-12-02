import { SaleFinalizedV1 } from "../../../../shared/events.js";
import { GetMenuStockMapUseCase } from "../menustockmap-usecase/get-menu-stock-map.use-case.js";
import { RecordSaleDeductionsUseCase } from "../inventoryjournal-usecase/record-sale-deductions.use-case.js";
import { InventoryPolicyAdapter } from "../../infra/adapters/policy.adapter.js";

/**
 * Event handler for sales.sale_finalized events
 *
 * Automatically deducts inventory when a sale is finalized,
 * respecting policy module's inventory_policies settings
 */
export class SaleFinalizedHandler {
  constructor(
    private policyAdapter: InventoryPolicyAdapter,
    private getMenuStockMapUseCase: GetMenuStockMapUseCase,
    private recordSaleDeductionsUseCase: RecordSaleDeductionsUseCase
  ) {}

  async handle(event: SaleFinalizedV1): Promise<void> {
    const { tenantId, branchId, saleId, lines } = event;

    console.log(
      `[SaleFinalizedHandler] Processing sale ${saleId} for tenant ${tenantId}, branch ${branchId}`
    );

    // Step 1: Check if automatic stock subtraction is enabled
    const shouldDeduct = await this.policyAdapter.shouldSubtractOnSale(tenantId, branchId);

    if (!shouldDeduct) {
      console.log(
        `[SaleFinalizedHandler] Auto-subtract disabled for tenant ${tenantId}, skipping deduction for sale ${saleId}`
      );
      return; // Policy says don't deduct
    }

    // Step 2: Get stock mappings for each menu item
    const deductionLines: Array<{ stockItemId: string; qtyDeducted: number }> =
      [];

    for (const line of lines) {
      const mappingsResult = await this.getMenuStockMapUseCase.execute(
        line.menuItemId
      );

      if (!mappingsResult.ok || mappingsResult.value.length === 0) {
        console.warn(
          `[SaleFinalizedHandler] No stock mapping found for menu item ${line.menuItemId} in sale ${saleId}`
        );
        continue; // Skip items without stock mappings
      }

      // Calculate total deductions based on quantity sold
      for (const mapping of mappingsResult.value) {
        deductionLines.push({
          stockItemId: mapping.stockItemId,
          qtyDeducted: mapping.qtyPerSale * line.qty,
        });
      }
    }

    if (deductionLines.length === 0) {
      console.log(
        `[SaleFinalizedHandler] No stock items to deduct for sale ${saleId} (no mappings found)`
      );
      return;
    }

    // Step 3: Record inventory deductions
    const result = await this.recordSaleDeductionsUseCase.execute({
      tenantId,
      branchId,
      refSaleId: saleId,
      lines: deductionLines,
    });

    if (!result.ok) {
      const errorMsg = `Failed to deduct inventory for sale ${saleId}`;
      console.error(`[SaleFinalizedHandler] ${errorMsg}`);
      throw new Error(errorMsg); // Throw to retry event processing
    }

    console.log(
      `[SaleFinalizedHandler] Successfully deducted inventory for sale ${saleId}: ${deductionLines.length} stock items`
    );
  }

}
