import { Ok, Err, type Result } from "../../../../../shared/result.js";
import { MenuStockMap } from "../../../domain/entities.js";
import type {
  IMenuItemRepository,
  IMenuStockMapRepository,
  IInventoryPort,
  IPolicyPort,
  ITransactionManager,
} from "../../../app/ports.js";

export class LinkMenuItemToStockUseCase {
  constructor(
    private menuItemRepo: IMenuItemRepository,
    private stockMapRepo: IMenuStockMapRepository,
    private inventoryPort: IInventoryPort,
    private policyPort: IPolicyPort,
    private txManager: ITransactionManager
  ) {}

  async execute(input: {
    tenantId: string;
    userId: string;
    menuItemId: string;
    stockItemId: string;
    qtyPerSale: number;
  }): Promise<Result<MenuStockMap, string>> {
    const { tenantId, userId, menuItemId, stockItemId, qtyPerSale } = input;

    // 1 - Check permissions (outside transaction)
    const canEdit = await this.policyPort.canEditMenuItem(tenantId, userId);
    if (!canEdit) {
      return Err("Permission denied");
    }

    // 3 - Verify stock item exists (external check - outside transaction)
    const stockExists = await this.inventoryPort.stockItemExists(
      stockItemId,
      tenantId
    );
    if (!stockExists) {
      return Err("Stock item not found in inventory module");
    }

    // 5 - Create menu stock map entity (outside transaction)
    const mappingResult = MenuStockMap.create({
      tenantId,
      menuItemId,
      stockItemId,
      qtyPerSale,
      createdBy: userId,
    });
    if (!mappingResult.ok) {
      return Err(`Validation failed: ${mappingResult.error}`);
    }
    const mapping = mappingResult.value;

    try {
      // 2, 4, 6 - Database operations in transaction
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

        // 4 - Check if mapping already exists
        const mappingExists = await this.stockMapRepo.exists(
          menuItemId,
          stockItemId,
          tenantId,
          client
        );
        if (mappingExists) {
          throw new Error("This stock item is already linked to the menu item");
        }

        // 6 - Save mapping
        await this.stockMapRepo.save(mapping, client);
      });

      // 7 - Return success
      return Ok(mapping);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to link stock item"
      );
    }
  }
}
