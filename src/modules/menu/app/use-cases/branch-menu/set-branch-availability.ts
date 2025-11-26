import { Ok, Err, type Result } from "../../../../../shared/result.js";
import { MenuBranchAvailabilityChangedV1 } from "../../../../../shared/events.js";
import type {
  IBranchMenuRepository,
  IMenuItemRepository,
  IPolicyPort,
  IEventBus,
  ITransactionManager,
} from "../../../app/ports.js";
import { pool } from "../../../../../platform/db/index.js";

export class SetBranchAvailabilityUseCase {
  constructor(
    private branchMenuRepo: IBranchMenuRepository,
    private menuItemRepo: IMenuItemRepository,
    private policyPort: IPolicyPort,
    private eventBus: IEventBus,
    private txManager: ITransactionManager
  ) {}

  async execute(input: {
    tenantId: string;
    userId: string;
    menuItemId: string;
    branchId: string;
    isAvailable: boolean;
  }): Promise<Result<void, string>> {
    const { tenantId, userId, menuItemId, branchId, isAvailable } = input;

    // 1 - Check permissions (outside transaction)
    const canManage = await this.policyPort.canManageBranchMenu(
      tenantId,
      userId,
      branchId
    );
    if (!canManage) {
      return Err("Permission denied for this branch");
    }

    try {
      // 2-4 - All operations in transaction
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

        // Check if branch exists
        const branchCheck = await client.query(
          "SELECT id FROM branches WHERE id = $1 AND tenant_id = $2",
          [branchId, tenantId]
        );
        if (branchCheck.rows.length === 0) {
          throw new Error("Branch not found");
        }

        // 3 - Set availability override
        await this.branchMenuRepo.setAvailability(
          menuItemId,
          branchId,
          tenantId,
          isAvailable,
          userId,
          client
        );

        // 4 - Publish event via outbox
        const event: MenuBranchAvailabilityChangedV1 = {
          type: "menu.branch_availability_changed",
          v: 1,
          tenantId,
          branchId,
          menuItemId,
          isAvailable,
          changedBy: userId,
          changedAt: new Date().toISOString(),
        };

        await this.eventBus.publishViaOutbox(event, client);
      });

      // 5 - Return success
      return Ok(undefined);
    } catch (error) {
      return Err(
        error instanceof Error
          ? error.message
          : "Failed to set branch availability"
      );
    }
  }
}
