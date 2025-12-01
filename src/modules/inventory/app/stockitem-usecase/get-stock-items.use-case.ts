import { StockItemRepository } from "../domain/repositories.js";
import { StockItem } from "../domain/entities.js";

export interface GetStockItemsInput {
  tenantId: string;
  q?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export class GetStockItemsUseCase {
  constructor(private stockItemRepo: StockItemRepository) {}

  async execute(
    input: GetStockItemsInput
  ): Promise<{ items: StockItem[]; nextPage?: number }> {
    // Note: This is simplified; in real impl, handle pagination and filtering
    const items = await this.stockItemRepo.findByTenantAndActive(
      input.tenantId,
      input.isActive
    );
    // Filter by q if provided (simple string match)
    const filtered = input.q
      ? items.filter((item) =>
          item.name.toLowerCase().includes(input.q!.toLowerCase())
        )
      : items;
    // Paginate
    const start = input.page ? (input.page - 1) * (input.pageSize || 20) : 0;
    const end = start + (input.pageSize || 20);
    const paginated = filtered.slice(start, end);
    const nextPage = end < filtered.length ? (input.page || 1) + 1 : undefined;
    return { items: paginated, nextPage };
  }
}
