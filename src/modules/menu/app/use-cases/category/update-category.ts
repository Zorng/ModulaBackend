/**
 * Update Category Use Case
 * Updates an existing category's name and/or display order
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";
import { Category } from "../../../domain/entities.js";

// TODO: Import port interfaces
// import type { ICategoryRepository, IPolicyPort, IEventBus } from "../../ports.js";

export class UpdateCategoryUseCase {
  constructor() // private categoryRepo: ICategoryRepository,
  // private policyPort: IPolicyPort,
  // private eventBus: IEventBus
  {}

  async execute(input: {
    tenantId: string;
    userId: string;
    categoryId: string;
    name?: string;
    displayOrder?: number;
  }): Promise<Result<Category, string>> {
    const { tenantId, userId, categoryId, name, displayOrder } = input;

    // TODO: Step 1 - Check permissions
    // const canUpdate = await this.policyPort.canCreateCategory(tenantId, userId);
    // if (!canUpdate) {
    //   return Err("Permission denied");
    // }

    // TODO: Step 2 - Load existing category
    // const category = await this.categoryRepo.findById(categoryId, tenantId);
    // if (!category) {
    //   return Err("Category not found");
    // }

    // TODO: Step 3 - Apply updates using entity methods
    // If name is provided, rename the category
    // if (name !== undefined) {
    //   const renameResult = category.rename(name);
    //   if (renameResult.isErr()) {
    //     return Err(`Failed to rename: ${renameResult.error}`);
    //   }
    // }

    // If displayOrder is provided, reorder the category
    // if (displayOrder !== undefined) {
    //   const reorderResult = category.reorder(displayOrder);
    //   if (reorderResult.isErr()) {
    //     return Err(`Failed to reorder: ${reorderResult.error}`);
    //   }
    // }

    // TODO: Step 4 - Save updated category
    // await this.categoryRepo.save(category);

    // TODO: Step 5 - Optionally publish CategoryUpdatedV1 event
    // (You may want to add this event to shared/events.ts)

    // TODO: Step 6 - Return success
    // return Ok(category);

    throw new Error(
      "Not implemented - uncomment and complete the TODOs above!"
    );
  }
}
