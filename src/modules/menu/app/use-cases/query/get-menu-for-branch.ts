/**
 * Get Menu for Branch Use Case
 * Retrieves complete menu snapshot for a specific branch (for POS offline operation)
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";

// Import port interfaces
import type {
  ICategoryRepository,
  IMenuItemRepository,
  IBranchMenuRepository,
  IModifierRepository,
  IMenuItemModifierRepository,
} from "../../../app/ports.js";

/**
 * Menu Snapshot structure for API responses
 * Used by POS terminals for offline operation
 */
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
      isAvailable: boolean; // branch-specific
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
    private itemModifierRepo: IMenuItemModifierRepository
  ) {}

  async execute(input: {
    tenantId: string;
    branchId: string;
  }): Promise<Result<MenuSnapshot, string>> {
    const { tenantId, branchId } = input;

    // 1 - Load all categories for tenant (ordered by displayOrder)
    const categories = await this.categoryRepo.findByTenantId(tenantId);

    // 2 - Load all menu items for tenant
    const allItems = await this.menuItemRepo.findByTenantId(tenantId);

    // 3 - For each menu item, get branch overrides
    const branchOverrides = new Map();
    for (const item of allItems) {
      const overrides = await this.branchMenuRepo.findByMenuItemId(
        item.id,
        tenantId
      );
      const branchOverride = overrides.find((o) => o.branchId === branchId);
      branchOverrides.set(item.id, branchOverride);
    }

    // 4 - For each menu item, load attached modifiers
    const itemModifiers = new Map();
    for (const item of allItems) {
      const modifiers = await this.itemModifierRepo.findByMenuItemId(
        item.id,
        tenantId
      );
      itemModifiers.set(item.id, modifiers);
    }

    // 5 - Build menu snapshot structure (with modifierRepo for group/options)
    const snapshot: MenuSnapshot = {
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

                // For each attached modifier, fetch group/options from modifierRepo
                const modifierDetails = await Promise.all(
                  Array.isArray(modifiers)
                    ? modifiers.map(async (m) => {
                        // Fetch group and its options from modifierRepo
                        const group = await this.modifierRepo.findGroupById(
                          m.group.id,
                          category.tenantId
                        );
                        let options: Array<{
                          id: string;
                          label: string;
                          priceAdjustmentUsd: number;
                        }> = [];
                        if (group) {
                          options =
                            await this.modifierRepo.findOptionsByGroupId(
                              group.id,
                              category.tenantId
                            );
                        }
                        return {
                          groupId: m.group.id,
                          groupName: m.group.name,
                          selectionType: m.group.selectionType,
                          isRequired: !!m.isRequired,
                          options: Array.isArray(options)
                            ? options.map((opt) => ({
                                id: opt.id,
                                label: opt.label,
                                priceAdjustmentUsd: opt.priceAdjustmentUsd,
                              }))
                            : [],
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
                  imageUrl: item.imageUrl === undefined ? null : item.imageUrl,
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

    // 6 - Return snapshot
    return Ok(snapshot);
  }
}
