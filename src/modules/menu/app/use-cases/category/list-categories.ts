/**
 * List Categories Use Case
 * Retrieves all categories for a tenant (ordered by displayOrder)
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";
import type { Category } from "../../../domain/entities.js";
import type { ICategoryRepository } from "../../ports.js";

export class ListCategoriesUseCase {
  constructor(private categoryRepo: ICategoryRepository) {}

  async execute(input: {
    tenantId: string;
  }): Promise<Result<Category[], string>> {
    const { tenantId } = input;

    try {
      //1 - Load all categories (ordered by displayOrder)
      const categories = await this.categoryRepo.findByTenantId(tenantId);

      //2 - Return categories
      return Ok(categories);
    } catch (error) {
      return Err(
        `Failed to list categories: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}
