import { Ok, Err, type Result } from "../../../../shared/result.js";
import { StockItemRepository } from "../../domain/repositories.js";
import { StockItem } from "../../domain/entities.js";
import type { StockItemUpdatedV1 } from "../../../../shared/events.js";

export interface UpdateStockItemInput {
  name?: string;
  unitText?: string;
  barcode?: string;
  defaultCostUsd?: number;
  categoryId?: string;
  imageUrl?: string;
  imageFile?: Buffer;
  imageFilename?: string;
  isActive?: boolean;
}

interface IEventBus {
  publishViaOutbox(event: StockItemUpdatedV1, client?: any): Promise<void>;
}

interface ITransactionManager {
  withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T>;
}

export interface IImageStoragePort {
  uploadImage(
    file: Buffer,
    filename: string,
    tenantId: string
  ): Promise<string>;
  isValidImageUrl(url: string): boolean;
}

export class UpdateStockItemUseCase {
  constructor(
    private stockItemRepo: StockItemRepository,
    private eventBus: IEventBus,
    private txManager: ITransactionManager,
    private imageStorage: IImageStoragePort
  ) {}

  async execute(
    stockItemId: string,
    userId: string,
    input: UpdateStockItemInput
  ): Promise<Result<StockItem, string>> {
    // Check if stock item exists
    const existing = await this.stockItemRepo.findById(stockItemId);
    if (!existing) {
      return Err("Stock item not found");
    }

    // Validation: if name is provided, it must not be empty
    if (input.name !== undefined && input.name.trim().length === 0) {
      return Err("Stock item name cannot be empty");
    }

    // Validation: if unitText is provided, it must not be empty
    if (input.unitText !== undefined && input.unitText.trim().length === 0) {
      return Err("Unit text cannot be empty");
    }

    let finalImageUrl: string | undefined = input.imageUrl;

    // Upload image if file is provided
    if (input.imageFile && input.imageFilename) {
      try {
        finalImageUrl = await this.imageStorage.uploadImage(
          input.imageFile,
          input.imageFilename,
          existing.tenantId
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

    // Sanitize inputs
    const updates: UpdateStockItemInput = {};
    if (input.name !== undefined) updates.name = input.name.trim();
    if (input.unitText !== undefined) updates.unitText = input.unitText.trim();
    if (input.barcode !== undefined)
      updates.barcode = input.barcode.trim() || undefined;
    if (input.defaultCostUsd !== undefined)
      updates.defaultCostUsd = input.defaultCostUsd;
    if (input.categoryId !== undefined) updates.categoryId = input.categoryId;
    if (finalImageUrl !== undefined) updates.imageUrl = finalImageUrl;
    if (input.isActive !== undefined) updates.isActive = input.isActive;

    try {
      let updatedItem: StockItem;

      await this.txManager.withTransaction(async (client) => {
        // Update stock item
        const result = await this.stockItemRepo.update(stockItemId, updates);
        if (!result) {
          throw new Error("Failed to update stock item");
        }
        updatedItem = result;

        // Publish event via outbox
        const event: StockItemUpdatedV1 = {
          type: "inventory.stock_item_updated",
          v: 1,
          tenantId: existing.tenantId,
          stockItemId: stockItemId,
          changes: updates,
          updatedBy: userId,
          updatedAt: new Date().toISOString(),
        };

        await this.eventBus.publishViaOutbox(event, client);
      });

      return Ok(updatedItem!);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to update stock item"
      );
    }
  }
}
