import { StockItemRepository } from "../../domain/repositories.js";
import { StockItem } from "../../domain/entities.js";

export interface GetStockItemsInput {
  tenantId: string;
  q?: string;
  isActive?: boolean;
  categoryId?: string;
  isIngredient?: boolean;
  isSellable?: boolean;
  page?: number;
  pageSize?: number;
}

export class GetStockItemsUseCase {
  constructor(private stockItemRepo: StockItemRepository) {}

  async execute(
    input: GetStockItemsInput
  ): Promise<{ items: StockItem[]; nextPage?: number }> {
    // Fetch items from repository
    const items = await this.stockItemRepo.findByTenantAndActive(
      input.tenantId,
      input.isActive
    );

    // Filter by category if provided
    let filtered = input.categoryId
      ? items.filter((item) => item.categoryId === input.categoryId)
      : items;

    // Filter by isIngredient if provided
    if (input.isIngredient !== undefined) {
      filtered = filtered.filter(
        (item) => item.isIngredient === input.isIngredient
      );
    }

    // Filter by isSellable if provided
    if (input.isSellable !== undefined) {
      filtered = filtered.filter(
        (item) => item.isSellable === input.isSellable
      );
    }

    // Filter by search query if provided (fuzzy match on name)
    filtered = input.q
      ? filtered.filter((item) =>
          item.name.toLowerCase().includes(input.q!.toLowerCase())
        )
      : filtered;

    // Paginate results
    const pageSize = input.pageSize || 20;
    const page = input.page || 1;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginated = filtered.slice(start, end);
    const nextPage = end < filtered.length ? page + 1 : undefined;

    return { items: paginated, nextPage };
  }
}
