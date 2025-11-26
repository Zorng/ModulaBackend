import { Ok, Err, type Result } from "../../../../../shared/result.js";
import type {
  ICategoryRepository,
  IMenuItemRepository,
  IBranchMenuRepository,
  IModifierRepository,
  IMenuItemModifierRepository,
  ITransactionManager,
} from "../../../app/ports.js";

export type MenuSnapshot = {
  categories: Array<{
    id: string;
    name: string;
    displayOrder: number;
    items: Array<{
      id: string;
      name: string;
      description: string;
      priceUsd: number;
      imageUrl: string | null;
      isAvailable: boolean;
      modifiers: Array<{
        groupId: string;
        groupName: string;
        selectionType: "SINGLE" | "MULTI";
        isRequired: boolean;
        options: Array<{
          id: string;
          label: string;
          priceAdjustmentUsd: number;
        }>;
      }>;
    }>;
  }>;
};

export class GetMenuForBranchUseCase {
  constructor(
    private categoryRepo: ICategoryRepository,
    private menuItemRepo: IMenuItemRepository,
    private branchMenuRepo: IBranchMenuRepository,
    private modifierRepo: IModifierRepository,
    private itemModifierRepo: IMenuItemModifierRepository,
    private txManager: ITransactionManager
  ) {}

  async execute(input: {
    tenantId: string;
    branchId: string;
  }): Promise<Result<MenuSnapshot, string>> {
    const { tenantId, branchId } = input;

    try {
      // Wrap entire read operation in transaction for consistency
      // This ensures all data is from the same point in time
      const snapshot = await this.txManager.withTransaction(async (client) => {
        // 1 - Load all categories for tenant
        const categories = await this.categoryRepo.findByTenantId(
          tenantId,
          client
        );

        // 2 - Load all menu items for tenant
        const allItems = await this.menuItemRepo.findByTenantId(
          tenantId,
          client
        );

        // 3 - Load branch overrides for all items
        const branchOverrides = new Map();
        for (const item of allItems) {
          const overrides = await this.branchMenuRepo.findByMenuItemId(
            item.id,
            tenantId,
            client
          );
          const branchOverride = overrides.find((o) => o.branchId === branchId);
          branchOverrides.set(item.id, branchOverride);
        }

        // 4 - Load attached modifiers for all items
        const itemModifiers = new Map();
        for (const item of allItems) {
          const modifiers = await this.itemModifierRepo.findByMenuItemId(
            item.id,
            tenantId,
            client
          );
          itemModifiers.set(item.id, modifiers);
        }

        // 5 - Build menu snapshot structure
        const menuSnapshot: MenuSnapshot = {
          categories: await Promise.all(
            categories.map(async (category) => ({
              id: category.id,
              name: category.name,
              displayOrder: category.displayOrder,
              items: await Promise.all(
                allItems
                  .filter(
                    (item) => item.categoryId === category.id && item.isActive
                  )
                  .map(async (item) => {
                    const override = branchOverrides.get(item.id);
                    const modifiers = itemModifiers.get(item.id) || [];

                    // For each attached modifier, fetch group/options
                    const modifierDetails = await Promise.all(
                      Array.isArray(modifiers)
                        ? modifiers.map(async (m) => {
                            const group = await this.modifierRepo.findGroupById(
                              m.group.id,
                              category.tenantId,
                              client
                            );
                            let options: Array<{
                              id: string;
                              label: string;
                              priceAdjustmentUsd: number;
                            }> = [];
                            if (group) {
                              const rawOptions =
                                await this.modifierRepo.findOptionsByGroupId(
                                  group.id,
                                  category.tenantId,
                                  client
                                );
                              options = Array.isArray(rawOptions)
                                ? rawOptions.map((opt) => ({
                                    id: opt.id,
                                    label: opt.label,
                                    priceAdjustmentUsd: opt.priceAdjustmentUsd,
                                  }))
                                : [];
                            }
                            return {
                              groupId: m.group.id,
                              groupName: m.group.name,
                              selectionType: m.group.selectionType,
                              isRequired: !!m.isRequired,
                              options,
                            };
                          })
                        : []
                    );

                    return {
                      id: item.id,
                      name: item.name,
                      description: item.description ?? "",
                      priceUsd:
                        typeof (override?.priceOverrideUsd ?? item.priceUsd) ===
                        "number"
                          ? override?.priceOverrideUsd ?? item.priceUsd
                          : 0,
                      imageUrl:
                        item.imageUrl === undefined ? null : item.imageUrl,
                      isAvailable:
                        typeof override?.isAvailable === "boolean"
                          ? override.isAvailable
                          : true,
                      modifiers: modifierDetails,
                    };
                  })
              ),
            }))
          ),
        };

        return menuSnapshot;
      });

      // 6 - Return snapshot
      return Ok(snapshot);
    } catch (error) {
      return Err(
        `Failed to get menu snapshot: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}
