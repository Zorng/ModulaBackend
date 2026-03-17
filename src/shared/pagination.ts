// Pagination utilities
export interface PaginationParams {
  cursor?: string;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  nextCursor?: string;
}

export interface OffsetPaginatedResult<T> {
  items: T[];
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
}

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 100;

export const normalizePaginationParams = (params: PaginationParams) => {
  const limit = Math.min(params.limit || DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
  return {
    cursor: params.cursor,
    limit,
  };
};

export function buildOffsetPaginatedResult<T>(input: {
  items: T[];
  limit: number;
  offset: number;
  total: number;
}): OffsetPaginatedResult<T> {
  return {
    items: input.items,
    limit: input.limit,
    offset: input.offset,
    total: input.total,
    hasMore: input.offset + input.items.length < input.total,
  };
}
