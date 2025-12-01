import { Ok, Err, type Result } from "../../../../shared/result.js";
import {
  MenuStockMapRepository,
  StockItemRepository,
} from "../../domain/repositories.js";
import { MenuStockMap } from "../../domain/entities.js";
import type { MenuStockMapSetV1 } from "../../../../shared/events.js";

export interface SetMenuStockMapInput {
  tenantId: string;
  menuItemId: string;
  stockItemId: string;
  qtyPerSale: number; // Positive value, will be negated on sale deduction
  updatedBy: string;
}

interface IEventBus {
  publishViaOutbox(event: MenuStockMapSetV1, client?: any): Promise<void>;
}

interface ITransactionManager {
  withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T>;
}

export class SetMenuStockMapUseCase {
  constructor(
    private menuStockMapRepo: MenuStockMapRepository,
    private stockItemRepo: StockItemRepository,
    private eventBus: IEventBus,
    private txManager: ITransactionManager
  ) {}

  async execute(
    input: SetMenuStockMapInput
  ): Promise<Result<MenuStockMap, string>> {
    const { tenantId, menuItemId, stockItemId, qtyPerSale, updatedBy } = input;

    // Validation: qtyPerSale must be positive (will be negated during deduction)
    if (qtyPerSale <= 0) {
      return Err("Quantity per sale must be positive");
    }

    // Verify stock item exists and belongs to tenant
    const stockItem = await this.stockItemRepo.findById(stockItemId);
    if (!stockItem) {
      return Err("Stock item not found");
    }
    if (stockItem.tenantId !== tenantId) {
      return Err("Stock item does not belong to this tenant");
    }

    try {
      let mapping: MenuStockMap;

      await this.txManager.withTransaction(async (client) => {
        // Upsert: repo handles ON CONFLICT (menu_item_id, stock_item_id)
        mapping = await this.menuStockMapRepo.save({
          menuItemId,
          tenantId,
          stockItemId,
          qtyPerSale,
          createdBy: updatedBy,
        });

        // Publish event
        const event: MenuStockMapSetV1 = {
          type: "inventory.menu_stock_map_set",
          v: 1,
          tenantId,
          menuItemId,
          stockItemId,
          qtyPerSale,
          updatedBy,
          updatedAt: new Date().toISOString(),
        };

        await this.eventBus.publishViaOutbox(event, client);
      });

      return Ok(mapping!);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to set menu stock map"
      );
    }
  }
}
