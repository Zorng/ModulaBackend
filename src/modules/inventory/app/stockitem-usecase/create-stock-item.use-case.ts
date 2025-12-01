import { Ok, Err, type Result } from "../../../../shared/result.js";
import { StockItemRepository } from "../../domain/repositories.js";
import { StockItem } from "../../domain/entities.js";
import type { StockItemCreatedV1 } from "../../../../shared/events.js";

export interface CreateStockItemInput {
  tenantId: string;
  userId: string;
  name: string;
  unitText: string;
  barcode?: string;
  defaultCostUsd?: number;
  isActive: boolean;
}

export interface IEventBus {
  publishViaOutbox(event: StockItemCreatedV1, client?: any): Promise<void>;
}

export interface ITransactionManager {
  withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T>;
}

export class CreateStockItemUseCase {
  constructor(
    private stockItemRepo: StockItemRepository,
    private eventBus: IEventBus,
    private txManager: ITransactionManager
  ) {}

  async execute(
    input: CreateStockItemInput
  ): Promise<Result<StockItem, string>> {
    const {
      tenantId,
      userId,
      name,
      unitText,
      barcode,
      defaultCostUsd,
      isActive,
    } = input;

    // Validation: name must not be empty
    if (!name || name.trim().length === 0) {
      return Err("Stock item name is required");
    }

    // Validation: unitText must not be empty
    if (!unitText || unitText.trim().length === 0) {
      return Err("Unit text is required");
    }

    try {
      let stockItem: StockItem;

      await this.txManager.withTransaction(async (client) => {
        // Save stock item
        stockItem = await this.stockItemRepo.save({
          tenantId,
          name: name.trim(),
          unitText: unitText.trim(),
          barcode: barcode?.trim() || undefined,
          defaultCostUsd,
          isActive,
          createdBy: userId,
        });

        // Publish event via outbox
        const event: StockItemCreatedV1 = {
          type: "inventory.stock_item_created",
          v: 1,
          tenantId: stockItem.tenantId,
          stockItemId: stockItem.id,
          name: stockItem.name,
          unitText: stockItem.unitText,
          barcode: stockItem.barcode,
          defaultCostUsd: stockItem.defaultCostUsd,
          isActive: stockItem.isActive,
          createdBy: userId,
          createdAt: new Date().toISOString(),
        };

        await this.eventBus.publishViaOutbox(event, client);
      });

      return Ok(stockItem!);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to create stock item"
      );
    }
  }
}
