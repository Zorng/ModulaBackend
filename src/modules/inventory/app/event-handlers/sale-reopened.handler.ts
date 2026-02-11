import { SaleReopenedV1 } from "../../../../shared/events.js";
import { GetMenuStockMapUseCase } from "../menustockmap-usecase/get-menu-stock-map.use-case.js";
import { RecordReopenUseCase } from "../inventoryjournal-usecase/record-reopen.use-case.js";
import { InventoryPolicyAdapter } from "../../infra/adapters/policy.adapter.js";
import { Pool } from "pg";

/**
 * Event handler for sales.sale_reopened events
 *
 * Automatically re-deducts inventory when a voided sale is reopened,
 * respecting policy module's inventory_policies settings
 */
export class SaleReopenedHandler {
  constructor(
    private policyAdapter: InventoryPolicyAdapter,
    private getMenuStockMapUseCase: GetMenuStockMapUseCase,
    private recordReopenUseCase: RecordReopenUseCase,
    private pool: Pool
  ) {}

  async handle(event: SaleReopenedV1): Promise<void> {
    const { tenantId, branchId, originalSaleId, newSaleId } = event;

    console.log(
      `[SaleReopenedHandler] Processing reopen for original sale ${originalSaleId}, new sale ${newSaleId} for tenant ${tenantId}, branch ${branchId}`
    );

    // Fetch original sale to get line items
    const originalSale = await this.fetchSaleLines(originalSaleId);

    if (!originalSale || originalSale.lines.length === 0) {
      console.warn(
        `[SaleReopenedHandler] Could not fetch line items for original sale ${originalSaleId}. Skipping inventory re-deduction.`
      );
      return;
    }

    console.log(
      `[SaleReopenedHandler] Fetched ${originalSale.lines.length} line items from original sale`
    );

    // Extract menu item IDs for policy check
    const menuItemIds = originalSale.lines.map(line => line.menuItemId);

    // Step 1: Check if automatic stock subtraction is enabled
    // This respects branch overrides and menu item exclusions
    const shouldDeduct = await this.policyAdapter.shouldSubtractOnSale(
      tenantId, 
      branchId,
      menuItemIds
    );

    if (!shouldDeduct) {
      console.log(
        `[SaleReopenedHandler] Auto-subtract disabled for tenant ${tenantId}, branch ${branchId}, skipping re-deduction for reopened sale ${newSaleId}`
      );
      return;
    }

    // Step 2: Get stock mappings for each menu item
    const deductionLines: Array<{
      stockItemId: string;
      qtyToRededuct: number;
    }> = [];

    for (const line of originalSale.lines) {
      const mappingsResult = await this.getMenuStockMapUseCase.execute(
        line.menuItemId
      );

      if (!mappingsResult.ok || mappingsResult.value.length === 0) {
        console.warn(
          `[SaleReopenedHandler] No stock mapping found for menu item ${line.menuItemId} in reopened sale ${newSaleId}`
        );
        continue;
      }

      // Calculate total deductions based on quantity sold
      for (const mapping of mappingsResult.value) {
        deductionLines.push({
          stockItemId: mapping.stockItemId,
          qtyToRededuct: mapping.qtyPerSale * line.qty,
        });
      }
    }

    if (deductionLines.length === 0) {
      console.log(
        `[SaleReopenedHandler] No stock items to re-deduct for reopened sale ${newSaleId} (no mappings found)`
      );
      return;
    }

    // Step 3: Record inventory re-deductions with new sale ID
    const result = await this.recordReopenUseCase.execute({
      tenantId,
      branchId,
      originalSaleId,
      newSaleId,
      lines: deductionLines,
    });

    if (!result.ok) {
      const errorMsg = `Failed to re-deduct inventory for reopened sale ${newSaleId}`;
      console.error(`[SaleReopenedHandler] ${errorMsg}`);
      throw new Error(errorMsg); // Throw to retry event processing
    }

    console.log(
      `[SaleReopenedHandler] Successfully re-deducted inventory for reopened sale ${newSaleId}: ${deductionLines.length} stock items`
    );
  }

  /**
   * Fetch sale line items from sales table
   * Note: This creates a dependency on sales module schema.
   * Better solution: Include lines in SaleReopenedV1 event.
   */
  private async fetchSaleLines(
    saleId: string
  ): Promise<{ lines: Array<{ menuItemId: string; qty: number }> } | null> {
    try {
      const result = await this.pool.query(
        `SELECT items FROM sales WHERE id = $1`,
        [saleId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const items = result.rows[0].items;

      // Transform sale items to the format we need
      const lines = items.map((item: any) => ({
        menuItemId: item.menuItemId || item.menu_item_id,
        qty: item.quantity || item.qty,
      }));

      return { lines };
    } catch (error) {
      console.error(
        `[SaleReopenedHandler] Error fetching sale lines for ${saleId}:`,
        error
      );
      return null;
    }
  }

}
