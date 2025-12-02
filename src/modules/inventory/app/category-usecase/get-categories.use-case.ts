import { InventoryCategoryRepository } from "../../domain/repositories.js";
import { Ok, Result } from "../../../../shared/result.js";

interface GetCategoriesInput {
  tenantId: string;
  isActive?: boolean;
}

export class GetCategoriesUseCase {
  constructor(private categoryRepo: InventoryCategoryRepository) {}

  async execute(input: GetCategoriesInput): Promise<Result<any, Error>> {
    const { tenantId, isActive } = input;

    const categories =
      typeof isActive === "boolean"
        ? await this.categoryRepo.findByTenantAndActive(tenantId, isActive)
        : await this.categoryRepo.findByTenant(tenantId);

    return Ok(categories);
  }
}
