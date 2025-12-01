import { Ok, Err, type Result } from "../../../../shared/result.js";
import { StorePolicyInventoryRepository } from "../../domain/repositories.js";
import { StorePolicyInventory } from "../../domain/entities.js";
import type { StorePolicyInventoryUpdatedV1 } from "../../../../shared/events.js";

export interface UpdateStorePolicyInventoryInput {
  inventorySubtractOnFinalize?: boolean;
  branchOverrides?: Record<string, any>;
  excludeMenuItemIds?: string[];
  updatedBy: string;
}

interface IEventBus {
  publishViaOutbox(
    event: StorePolicyInventoryUpdatedV1,
    client?: any
  ): Promise<void>;
}

interface ITransactionManager {
  withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T>;
}

export class UpdateStorePolicyInventoryUseCase {
  constructor(
    private policyRepo: StorePolicyInventoryRepository,
    private eventBus: IEventBus,
    private txManager: ITransactionManager
  ) {}

  async execute(
    tenantId: string,
    input: UpdateStorePolicyInventoryInput
  ): Promise<Result<StorePolicyInventory, string>> {
    const {
      inventorySubtractOnFinalize,
      branchOverrides,
      excludeMenuItemIds,
      updatedBy,
    } = input;

    // Validation: at least one field must be provided
    if (
      inventorySubtractOnFinalize === undefined &&
      branchOverrides === undefined &&
      excludeMenuItemIds === undefined
    ) {
      return Err("At least one field must be provided for update");
    }

    try {
      let policy: StorePolicyInventory | null = null;

      await this.txManager.withTransaction(async (client) => {
        // Check if policy exists, create if not
        const existing = await this.policyRepo.findByTenant(tenantId);
        if (!existing) {
          // Create new policy with provided values and defaults
          policy = await this.policyRepo.save({
            tenantId,
            inventorySubtractOnFinalize: inventorySubtractOnFinalize ?? true,
            branchOverrides: branchOverrides ?? {},
            excludeMenuItemIds: excludeMenuItemIds ?? [],
            updatedBy,
          });
        } else {
          // Update existing policy
          policy = await this.policyRepo.update(tenantId, {
            inventorySubtractOnFinalize,
            branchOverrides,
            excludeMenuItemIds,
            updatedBy,
          });
        }

        if (!policy) {
          throw new Error("Failed to update store policy");
        }

        // Publish event
        const event: StorePolicyInventoryUpdatedV1 = {
          type: "inventory.store_policy_updated",
          v: 1,
          tenantId,
          changes: {
            inventorySubtractOnFinalize,
            branchOverrides,
            excludeMenuItemIds,
          },
          updatedBy,
          updatedAt: new Date().toISOString(),
        };

        await this.eventBus.publishViaOutbox(event, client);
      });

      return Ok(policy!);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to update store policy"
      );
    }
  }
}
