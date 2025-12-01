import { SaleFinalizedV1 } from "../../../../shared/events.js";
import { GetStorePolicyInventoryUseCase } from "../storepolicyinventory-usecase/get-store-policy-inventory.use-case.js";
import { GetMenuStockMapUseCase } from "../menustockmap-usecase/get-menu-stock-map.use-case.js";
import { RecordSaleDeductionsUseCase } from "../inventoryjournal-usecase/record-sale-deductions.use-case.js";
import { StorePolicyInventory } from "../../domain/entities.js";

/**
 * Event handler for sales.sale_finalized events
 *
 * Automatically deducts inventory when a sale is finalized,
 * respecting store policy configuration (global, branch overrides, excluded items)
 */
export class SaleFinalizedHandler {
  constructor(
    private getStorePolicyUseCase: GetStorePolicyInventoryUseCase,
    private getMenuStockMapUseCase: GetMenuStockMapUseCase,
    private recordSaleDeductionsUseCase: RecordSaleDeductionsUseCase
  ) {}

  async handle(event: SaleFinalizedV1): Promise<void> {
    const { tenantId, branchId, saleId, lines } = event;

    console.log(
      `[SaleFinalizedHandler] Processing sale ${saleId} for tenant ${tenantId}, branch ${branchId}`
    );

    // Step 1: Get store policy (creates default if missing)
    const policyResult = await this.getStorePolicyUseCase.executeWithDefault(
      tenantId,
      "system" // System actor for automatic deduction
    );

    if (!policyResult.ok) {
      console.error(
        `[SaleFinalizedHandler] Failed to get store policy for tenant ${tenantId}:`,
        policyResult.error
      );
      return; // Skip deduction if policy check fails
    }

    const policy = policyResult.value;

    // Step 2: Check if this branch/tenant should deduct inventory
    const shouldDeduct = this.shouldDeductInventory(
      policy,
      branchId,
      lines.map((l) => l.menuItemId)
    );

    if (!shouldDeduct) {
      console.log(
        `[SaleFinalizedHandler] Policy blocks inventory deduction for sale ${saleId}`
      );
      return; // Policy says don't deduct
    }

    // Step 3: Get stock mappings for each menu item
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

    // Step 4: Record inventory deductions
    const result = await this.recordSaleDeductionsUseCase.execute({
      tenantId,
      branchId,
      refSaleId: saleId,
      lines: deductionLines,
    });

    if (!result.ok) {
      console.error(
        `[SaleFinalizedHandler] Failed to deduct inventory for sale ${saleId}:`,
        result.error
      );
      throw new Error(result.error); // Throw to retry event processing
    }

    console.log(
      `[SaleFinalizedHandler] Successfully deducted inventory for sale ${saleId}: ${deductionLines.length} stock items`
    );
  }

  /**
   * Determines if inventory should be deducted based on store policy
   *
   * Policy evaluation order:
   * 1. Check if any menu items are in exclusion list → Skip deduction
   * 2. Check if branch has override → Use override setting
   * 3. Otherwise → Use tenant default setting
   */
  private shouldDeductInventory(
    policy: StorePolicyInventory,
    branchId: string,
    menuItemIds: string[]
  ): boolean {
    // Check if any menu items are excluded
    for (const menuItemId of menuItemIds) {
      if (policy.excludeMenuItemIds.includes(menuItemId)) {
        console.log(
          `[SaleFinalizedHandler] Menu item ${menuItemId} is excluded from inventory deduction`
        );
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
        console.log(
          `[SaleFinalizedHandler] Using branch override for ${branchId}: ${branchOverride.inventorySubtractOnFinalize}`
        );
        return branchOverride.inventorySubtractOnFinalize;
      }
    }

    // Use default tenant policy
    console.log(
      `[SaleFinalizedHandler] Using tenant default policy: ${policy.inventorySubtractOnFinalize}`
    );
    return policy.inventorySubtractOnFinalize;
  }
}
