/**
 * Get Menu for Branch Use Case
 * Retrieves complete menu snapshot for a specific branch (for POS offline operation)
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";

// TODO: Import port interfaces
// import type {
//   ICategoryRepository,
//   IMenuItemRepository,
//   IBranchMenuRepository,
//   IModifierRepository,
//   IMenuItemModifierRepository
// } from "../../ports.js";

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
  constructor() // private categoryRepo: ICategoryRepository,
  // private menuItemRepo: IMenuItemRepository,
  // private branchMenuRepo: IBranchMenuRepository,
  // private modifierRepo: IModifierRepository,
  // private itemModifierRepo: IMenuItemModifierRepository
  {}

  async execute(input: {
    tenantId: string;
    branchId: string;
  }): Promise<Result<MenuSnapshot, string>> {
    const { tenantId, branchId } = input;

    // TODO: Step 1 - Load all categories for tenant (ordered by displayOrder)
    // const categories = await this.categoryRepo.findByTenantId(tenantId);

    // TODO: Step 2 - Load all menu items for tenant
    // const allItems = await this.menuItemRepo.findByTenantId(tenantId);

    // TODO: Step 3 - For each menu item, get branch overrides
    // const branchOverrides = new Map();
    // for (const item of allItems) {
    //   const overrides = await this.branchMenuRepo.findByMenuItemId(item.id, tenantId);
    //   const branchOverride = overrides.find(o => o.branchId === branchId);
    //   branchOverrides.set(item.id, branchOverride);
    // }

    // TODO: Step 4 - For each menu item, load attached modifiers
    // const itemModifiers = new Map();
    // for (const item of allItems) {
    //   const modifiers = await this.itemModifierRepo.findByMenuItemId(item.id, tenantId);
    //   itemModifiers.set(item.id, modifiers);
    // }

    // TODO: Step 5 - Build menu snapshot structure
    // const snapshot: MenuSnapshot = {
    //   categories: categories.map(category => ({
    //     id: category.id,
    //     name: category.name,
    //     displayOrder: category.displayOrder,
    //     items: allItems
    //       .filter(item => item.categoryId === category.id && item.isActive)
    //       .map(item => {
    //         const override = branchOverrides.get(item.id);
    //         const modifiers = itemModifiers.get(item.id) || [];
    //
    //         return {
    //           id: item.id,
    //           name: item.name,
    //           description: item.description,
    //           priceUsd: override?.priceOverrideUsd ?? item.priceUsd,
    //           imageUrl: item.imageUrl,
    //           isAvailable: override?.isAvailable ?? true,
    //           modifiers: modifiers.map(m => ({
    //             groupId: m.group.id,
    //             groupName: m.group.name,
    //             selectionType: m.group.selectionType,
    //             isRequired: m.isRequired,
    //             options: [] // Load from modifierRepo.findOptionsByGroupId
    //           }))
    //         };
    //       })
    //   }))
    // };

    // TODO: Step 6 - Return snapshot
    // return Ok(snapshot);

    throw new Error(
      "Not implemented - uncomment and complete the TODOs above!"
    );
  }
}
