// Pagination utilities
export interface PaginationParams {
  cursor?: string;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  nextCursor?: string;
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
