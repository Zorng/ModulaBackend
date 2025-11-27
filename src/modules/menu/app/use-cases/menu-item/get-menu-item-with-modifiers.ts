/**
 * Get Menu Item With Modifiers Use Case
 * Retrieves a single menu item with all its attached modifier groups and options
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";
import type {
  IMenuItemRepository,
  IMenuItemModifierRepository,
  IModifierRepository,
} from "../../../app/ports.js";

// Response type that includes menu item with full modifier details
export interface MenuItemWithModifiers {
  // Menu item details
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  priceUsd: number;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  // Attached modifier groups with their options
  modifiers: Array<{
    group: {
      id: string;
      name: string;
      selectionType: "SINGLE" | "MULTI";
      createdAt: Date;
      updatedAt: Date;
    };
    isRequired: boolean;
    options: Array<{
      id: string;
      label: string;
      priceAdjustmentUsd: number;
      isDefault: boolean;
      createdAt: Date;
    }>;
  }>;
}

export class GetMenuItemWithModifiersUseCase {
  constructor(
    private menuItemRepo: IMenuItemRepository,
    private menuItemModifierRepo: IMenuItemModifierRepository,
    private modifierRepo: IModifierRepository
  ) {}

  async execute(input: {
    tenantId: string;
    menuItemId: string;
  }): Promise<Result<MenuItemWithModifiers, string>> {
    const { tenantId, menuItemId } = input;

    // 1. Get the menu item
    const menuItem = await this.menuItemRepo.findById(menuItemId, tenantId);
    if (!menuItem) {
      return Err("Menu item not found");
    }

    // 2. Get all modifier groups attached to this menu item
    const attachedModifiers = await this.menuItemModifierRepo.findByMenuItemId(
      menuItemId,
      tenantId
    );

    // 3. For each modifier group, get its options
    const modifiersWithOptions = await Promise.all(
      attachedModifiers.map(async ({ group, isRequired }) => {
        const options = await this.modifierRepo.findOptionsByGroupId(
          group.id,
          tenantId
        );

        return {
          group: {
            id: group.id,
            name: group.name,
            selectionType: group.selectionType,
            createdAt: group.createdAt,
            updatedAt: group.updatedAt,
          },
          isRequired,
          options: options.map((option) => ({
            id: option.id,
            label: option.label,
            priceAdjustmentUsd: option.priceAdjustmentUsd,
            isDefault: option.isDefault,
            createdAt: option.createdAt,
          })),
        };
      })
    );

    // 4. Build the response
    const result: MenuItemWithModifiers = {
      id: menuItem.id,
      categoryId: menuItem.categoryId,
      name: menuItem.name,
      description: menuItem.description ?? null,
      priceUsd: menuItem.priceUsd,
      imageUrl: menuItem.imageUrl ?? null,
      isActive: menuItem.isActive,
      createdAt: menuItem.createdAt,
      updatedAt: menuItem.updatedAt,
      modifiers: modifiersWithOptions,
    };

    return Ok(result);
  }
}
