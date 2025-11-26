import { Ok, Err, type Result } from "../../../../../shared/result.js";
import type {
  IBranchMenuRepository,
  IMenuItemRepository,
  IPolicyPort,
  ITransactionManager,
} from "../../../app/ports.js";

export class SetBranchPriceOverrideUseCase {
  constructor(
    private branchMenuRepo: IBranchMenuRepository,
    private menuItemRepo: IMenuItemRepository,
    private policyPort: IPolicyPort,
    private txManager: ITransactionManager
  ) {}

  async execute(input: {
    tenantId: string;
    userId: string;
    menuItemId: string;
    branchId: string;
    priceUsd: number;
  }): Promise<Result<void, string>> {
    const { tenantId, userId, menuItemId, branchId, priceUsd } = input;

    // 1 - Check permissions (outside transaction)
    const canManage = await this.policyPort.canManageBranchMenu(
      tenantId,
      userId,
      branchId
    );
    if (!canManage) {
      return Err("Permission denied for this branch");
    }

    // 3 - Validate price (outside transaction - no DB access)
    if (priceUsd < 0) {
      return Err("Price cannot be negative");
    }

    try {
      // 2, 4 - Database operations in transaction
      await this.txManager.withTransaction(async (client) => {
        // 2 - Verify menu item exists
        const item = await this.menuItemRepo.findById(
          menuItemId,
          tenantId,
          client
        );
        if (!item) {
          throw new Error("Menu item not found");
        }

        // 4 - Set price override
        await this.branchMenuRepo.setPriceOverride(
          menuItemId,
          branchId,
          tenantId,
          priceUsd,
          userId,
          client
        );

        // 5 - Optionally publish event (BranchPriceOverrideSetV1)
        // TODO: Add event if needed in the future
      });

      // 6 - Return success
      return Ok(undefined);
    } catch (error) {
      return Err(
        error instanceof Error
          ? error.message
          : "Failed to set branch price override"
      );
    }
  }
}
