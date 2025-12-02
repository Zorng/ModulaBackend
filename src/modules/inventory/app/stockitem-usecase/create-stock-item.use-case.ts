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
  pieceSize?: number;
  isIngredient: boolean;
  isSellable: boolean;
  categoryId?: string;
  imageUrl?: string;
  imageFile?: Buffer;
  imageFilename?: string;
  isActive: boolean;
}

export interface IEventBus {
  publishViaOutbox(event: StockItemCreatedV1, client?: any): Promise<void>;
}

export interface ITransactionManager {
  withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T>;
}

export interface IImageStoragePort {
  uploadImage(
    file: Buffer,
    filename: string,
    tenantId: string,
    module?: string
  ): Promise<string>;
  isValidImageUrl(url: string): boolean;
}

export class CreateStockItemUseCase {
  constructor(
    private stockItemRepo: StockItemRepository,
    private eventBus: IEventBus,
    private txManager: ITransactionManager,
    private imageStorage: IImageStoragePort
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
      pieceSize,
      isIngredient,
      isSellable,
      categoryId,
      imageUrl,
      imageFile,
      imageFilename,
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

    let finalImageUrl: string | undefined = imageUrl;

    // Upload image if file is provided
    if (imageFile && imageFilename) {
      try {
        finalImageUrl = await this.imageStorage.uploadImage(
          imageFile,
          imageFilename,
          tenantId,
          "inventory"
        );
      } catch (err) {
        return Err(
          err instanceof Error ? err.message : "Failed to upload image"
        );
      }
    }

    // Validate image URL if provided
    if (finalImageUrl && !this.imageStorage.isValidImageUrl(finalImageUrl)) {
      return Err("Invalid image URL format. Use .jpg, .jpeg, .webp, or .png");
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
          pieceSize,
          isIngredient,
          isSellable,
          categoryId,
          imageUrl: finalImageUrl,
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
          pieceSize: stockItem.pieceSize,
          isIngredient: stockItem.isIngredient,
          isSellable: stockItem.isSellable,
          categoryId: stockItem.categoryId,
          imageUrl: stockItem.imageUrl,
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
