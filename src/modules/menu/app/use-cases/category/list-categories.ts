/**
 * List Categories Use Case
 * Retrieves all categories for a tenant (ordered by displayOrder)
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";
import { Category } from "../../../domain/entities.js";

// TODO: Import port interfaces
// import type { ICategoryRepository } from "../../ports.js";

export class ListCategoriesUseCase {
  constructor() // private categoryRepo: ICategoryRepository
  {}

  async execute(input: {
    tenantId: string;
  }): Promise<Result<Category[], string>> {
    const { tenantId } = input;

    // TODO: Step 1 - Load all categories (ordered by displayOrder)
    // const categories = await this.categoryRepo.findByTenantId(tenantId);

    // TODO: Step 2 - Return categories
    // return Ok(categories);

    throw new Error(
      "Not implemented - uncomment and complete the TODOs above!"
    );
  }
}
