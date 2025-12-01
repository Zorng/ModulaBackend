import { SaleReopenedV1 } from "../../../../shared/events.js";
import { GetStorePolicyInventoryUseCase } from "../storepolicyinventory-usecase/get-store-policy-inventory.use-case.js";
import { GetMenuStockMapUseCase } from "../menustockmap-usecase/get-menu-stock-map.use-case.js";
import { RecordReopenUseCase } from "../inventoryjournal-usecase/record-reopen.use-case.js";
import { StorePolicyInventory } from "../../domain/entities.js";
import { Pool } from "pg";

/**
 * Event handler for sales.sale_reopened events
 *
 * Automatically re-deducts inventory when a voided sale is reopened,
 * respecting store policy configuration
 */
export class SaleReopenedHandler {
  constructor(
    private getStorePolicyUseCase: GetStorePolicyInventoryUseCase,
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

    // Step 1: Get store policy (creates default if missing)
    const policyResult = await this.getStorePolicyUseCase.executeWithDefault(
      tenantId,
      "system"
    );

    if (!policyResult.ok) {
      console.error(
        `[SaleReopenedHandler] Failed to get store policy for tenant ${tenantId}:`,
        policyResult.error
      );
      return;
    }

    const policy = policyResult.value;

    // Step 2: Check if this branch/tenant should deduct inventory
    const shouldDeduct = this.shouldDeductInventory(
      policy,
      branchId,
      originalSale.lines.map((l) => l.menuItemId)
    );

    if (!shouldDeduct) {
      console.log(
        `[SaleReopenedHandler] Policy blocks inventory re-deduction for reopened sale ${newSaleId}`
      );
      return;
    }

    // Step 3: Get stock mappings for each menu item
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

    // Step 4: Record inventory re-deductions with new sale ID
    const result = await this.recordReopenUseCase.execute({
      tenantId,
      branchId,
      originalSaleId,
      newSaleId,
      lines: deductionLines,
    });

    if (!result.ok) {
      console.error(
        `[SaleReopenedHandler] Failed to re-deduct inventory for reopened sale ${newSaleId}:`,
        result.error
      );
      throw new Error(result.error); // Throw to retry event processing
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

  private shouldDeductInventory(
    policy: StorePolicyInventory,
    branchId: string,
    menuItemIds: string[]
  ): boolean {
    // Check if any menu items are excluded
    for (const menuItemId of menuItemIds) {
      if (policy.excludeMenuItemIds.includes(menuItemId)) {
        return false;
      }
    }

    // Check branch override
    if (policy.branchOverrides && policy.branchOverrides[branchId]) {
      const branchOverride = policy.branchOverrides[branchId];
      if (
        branchOverride.inventorySubtractOnFinalize !== undefined &&
        branchOverride.inventorySubtractOnFinalize !== null
      ) {
        return branchOverride.inventorySubtractOnFinalize;
      }
    }

    // Use default tenant policy
    return policy.inventorySubtractOnFinalize;
  }
}
