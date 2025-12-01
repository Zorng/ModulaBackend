import { SaleVoidedV1 } from "../../../../shared/events.js";
import { GetMenuStockMapUseCase } from "../menustockmap-usecase/get-menu-stock-map.use-case.js";
import { RecordVoidUseCase } from "../inventoryjournal-usecase/record-void.use-case.js";

/**
 * Event handler for sales.sale_voided events
 *
 * Automatically restores inventory when a sale is voided,
 * reversing the original deductions
 */
export class SaleVoidedHandler {
  constructor(
    private getMenuStockMapUseCase: GetMenuStockMapUseCase,
    private recordVoidUseCase: RecordVoidUseCase
  ) {}

  async handle(event: SaleVoidedV1): Promise<void> {
    const { tenantId, branchId, saleId, lines } = event;

    console.log(
      `[SaleVoidedHandler] Processing void for sale ${saleId} for tenant ${tenantId}, branch ${branchId}`
    );

    // Get stock mappings for each menu item to determine what was deducted
    const reversalLines: Array<{
      stockItemId: string;
      qtyOriginallyDeducted: number;
    }> = [];

    for (const line of lines) {
      const mappingsResult = await this.getMenuStockMapUseCase.execute(
        line.menuItemId
      );

      if (!mappingsResult.ok || mappingsResult.value.length === 0) {
        console.warn(
          `[SaleVoidedHandler] No stock mapping found for menu item ${line.menuItemId} in voided sale ${saleId}`
        );
        continue; // Skip items without stock mappings
      }

      // Calculate original deductions that need to be reversed
      for (const mapping of mappingsResult.value) {
        reversalLines.push({
          stockItemId: mapping.stockItemId,
          qtyOriginallyDeducted: mapping.qtyPerSale * line.qty,
        });
      }
    }

    if (reversalLines.length === 0) {
      console.log(
        `[SaleVoidedHandler] No stock items to restore for voided sale ${saleId} (no mappings found)`
      );
      return;
    }

    // Record inventory reversals
    const result = await this.recordVoidUseCase.execute({
      tenantId,
      branchId,
      refSaleId: saleId,
      originalLines: reversalLines,
    });

    if (!result.ok) {
      console.error(
        `[SaleVoidedHandler] Failed to restore inventory for voided sale ${saleId}:`,
        result.error
      );
      throw new Error(result.error); // Throw to retry event processing
    }

    console.log(
      `[SaleVoidedHandler] Successfully restored inventory for voided sale ${saleId}: ${reversalLines.length} stock items`
    );
  }
}
