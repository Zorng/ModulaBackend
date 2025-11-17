/**
 * Link Menu Item to Stock Use Case
 * Links a menu item to an inventory stock item for automatic deduction
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";
import { MenuStockMap } from "../../../domain/entities.js";

// Import port interfaces
import type {
  IMenuItemRepository,
  IMenuStockMapRepository,
  IInventoryPort,
  IPolicyPort
} from "../../ports.js";

export class LinkMenuItemToStockUseCase {
  constructor(
    private menuItemRepo: IMenuItemRepository,
    private stockMapRepo: IMenuStockMapRepository,
    private inventoryPort: IInventoryPort,
    private policyPort: IPolicyPort  
  ) 

  {}

  async execute(input: {
    tenantId: string;
    userId: string;
    menuItemId: string;
    stockItemId: string;
    qtyPerSale: number;
  }): Promise<Result<MenuStockMap, string>> {
    const { tenantId, userId, menuItemId, stockItemId, qtyPerSale } = input;

    //1 - Check permissions
    const canEdit = await this.policyPort.canEditMenuItem(tenantId, userId);
    if (!canEdit) {
      return Err("Permission denied");
    }

    //2 - Verify menu item exists
    const item = await this.menuItemRepo.findById(menuItemId, tenantId);
    if (!item) {
      return Err("Menu item not found");
    }

    //3 - Verify stock item exists in inventory module
    const stockExists = await this.inventoryPort.stockItemExists(stockItemId, tenantId);
    if (!stockExists) {
      return Err("Stock item not found in inventory module");
    }

    //4 - Check if mapping already exists
    const mappingExists = await this.stockMapRepo.exists(menuItemId, stockItemId, tenantId);
    if (mappingExists) {
      return Err("This stock item is already linked to the menu item");
    }

    //5 - Create menu stock map entity
    const mappingResult = MenuStockMap.create({
      tenantId,
      menuItemId,
      stockItemId,
      qtyPerSale,
      createdBy: userId
    });
    if (!mappingResult.ok) {
      return Err(`Validation failed: ${mappingResult.error}`);
    }
    const mapping = mappingResult.value;

    //6 - Save mapping
    await this.stockMapRepo.save(mapping);

    //7 - Return success
    return Ok(mapping);
  }
}
