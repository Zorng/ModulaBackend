/**
 * Delete Category Use Case
 * Soft-deletes a category (deactivates) after validating no menu items exist
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";

// TODO: Import port interfaces
// import type { ICategoryRepository, IMenuItemRepository, IPolicyPort } from "../../ports.js";

export class DeleteCategoryUseCase {
  constructor() // private categoryRepo: ICategoryRepository,
  // private menuItemRepo: IMenuItemRepository,
  // private policyPort: IPolicyPort
  {}

  async execute(input: {
    tenantId: string;
    userId: string;
    categoryId: string;
  }): Promise<Result<void, string>> {
    const { tenantId, userId, categoryId } = input;

    // TODO: Step 1 - Check permissions
    // const canDelete = await this.policyPort.canCreateCategory(tenantId, userId);
    // if (!canDelete) {
    //   return Err("Permission denied");
    // }

    // TODO: Step 2 - Load category
    // const category = await this.categoryRepo.findById(categoryId, tenantId);
    // if (!category) {
    //   return Err("Category not found");
    // }

    // TODO: Step 3 - Check if category has menu items
    // const items = await this.menuItemRepo.findByCategoryId(categoryId, tenantId);
    // if (items.length > 0) {
    //   return Err(
    //     `Cannot delete category "${category.name}" because it has ${items.length} menu item(s). ` +
    //     `Please move or delete the items first.`
    //   );
    // }

    // TODO: Step 4 - Soft delete (deactivate)
    // const deactivateResult = category.deactivate();
    // if (deactivateResult.isErr()) {
    //   return Err(`Failed to deactivate: ${deactivateResult.error}`);
    // }
    // await this.categoryRepo.save(category);

    // TODO: Step 5 - Return success
    // return Ok(undefined);

    throw new Error(
      "Not implemented - uncomment and complete the TODOs above!"
    );
  }
}
