/**
 * Get Category Use Case
 * Retrieves a specific category by ID
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";
import type { Category } from "../../../domain/entities.js";
import type { ICategoryRepository } from "../../../app/ports.js";

export class GetCategoryUseCase {
  constructor(private categoryRepo: ICategoryRepository) {}

  async execute(input: {
    tenantId: string;
    categoryId: string;
  }): Promise<Result<Category, string>> {
    const { tenantId, categoryId } = input;

    try {
      // 1 - Find category by ID
      const category = await this.categoryRepo.findById(categoryId, tenantId);

      if (!category) {
        return Err("Category not found");
      }

      // 2 - Return category
      return Ok(category);
    } catch (error) {
      return Err(
        `Failed to get category: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}
