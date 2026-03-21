import {
  type V0ReportingRestockCostFilter,
  type V0ReportingSalesStatusFilter,
  type V0ReportingWindow,
} from "./command-contract.js";
import {
  V0ReportingRepository,
  type V0ReportingBranchAccessRow,
} from "../infra/repository.js";
import { buildOffsetPaginatedResult } from "../../../../shared/pagination.js";

type ActorContext = {
  accountId: string;
  tenantId: string | null;
  branchId: string | null;
};

type ReportBranchScope = "BRANCH" | "ALL_BRANCHES";
type MembershipRole = "OWNER" | "ADMIN" | "MANAGER" | "CASHIER";

type ReportScopeEcho = {
  tenantId: string;
  branchScope: ReportBranchScope;
  branchId: string | null;
  from: string;
  to: string;
  timezone: "Asia/Phnom_Penh";
  frozenBranchIds: string[];
};

type ResolvedScope = {
  tenantId: string;
  branchScope: ReportBranchScope;
  branchId: string | null;
  branchIds: string[];
  frozenBranchIds: string[];
};

type ResolvedWindow = {
  fromDate: string;
  toDate: string;
  fromInclusive: Date;
  toExclusive: Date;
};

type ResolveScopeInput = {
  actor: ActorContext;
  branchScope: unknown;
  branchId: unknown;
};

const PHNOM_PENH_TIMEZONE = "Asia/Phnom_Penh" as const;
const PHNOM_PENH_OFFSET_HOURS = 7;

export class V0ReportingError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "V0ReportingError";
  }
}

export class V0ReportingService {
  constructor(private readonly repo: V0ReportingRepository) {}

  async getSalesSummary(input: {
    actor: ActorContext;
    query: {
      window?: unknown;
      from?: unknown;
      to?: unknown;
      branchScope?: unknown;
      branchId?: unknown;
      topN?: unknown;
    };
  }): Promise<Record<string, unknown>> {
    const scope = await this.resolveScope({
      actor: input.actor,
      branchScope: input.query.branchScope,
      branchId: input.query.branchId,
    });
    const window = resolveWindow({
      window: input.query.window,
      from: input.query.from,
      to: input.query.to,
      allowedWindows: ["day", "week", "month", "custom"],
    });
    const topN = normalizeTopN(input.query.topN);

    const [core, paymentBreakdown, cashTenderBreakdown, saleTypeBreakdown, topItems, category] =
      await Promise.all([
        this.repo.getSalesSummaryCore({
          tenantId: scope.tenantId,
          fromInclusive: window.fromInclusive,
          toExclusive: window.toExclusive,
          branchIds: scope.branchIds,
        }),
        this.repo.listSalesPaymentBreakdown({
          tenantId: scope.tenantId,
          fromInclusive: window.fromInclusive,
          toExclusive: window.toExclusive,
          branchIds: scope.branchIds,
        }),
        this.repo.listSalesCashTenderBreakdown({
          tenantId: scope.tenantId,
          fromInclusive: window.fromInclusive,
          toExclusive: window.toExclusive,
          branchIds: scope.branchIds,
        }),
        this.repo.listSalesTypeBreakdown({
          tenantId: scope.tenantId,
          fromInclusive: window.fromInclusive,
          toExclusive: window.toExclusive,
          branchIds: scope.branchIds,
        }),
        this.repo.listSalesTopItems({
          tenantId: scope.tenantId,
          fromInclusive: window.fromInclusive,
          toExclusive: window.toExclusive,
          branchIds: scope.branchIds,
          topN,
        }),
        this.repo.listSalesCategoryBreakdown({
          tenantId: scope.tenantId,
          fromInclusive: window.fromInclusive,
          toExclusive: window.toExclusive,
          branchIds: scope.branchIds,
        }),
      ]);

    const confirmedCount = Number(core.confirmed_transaction_count ?? 0);
    const averageTicketUsd =
      confirmedCount > 0 ? Number(core.confirmed_total_grand_usd ?? 0) / confirmedCount : null;
    const averageTicketKhr =
      confirmedCount > 0 ? Number(core.confirmed_total_grand_khr ?? 0) / confirmedCount : null;

    return {
      scope: buildScopeEcho(scope, window),
      confirmed: {
        transactionCount: confirmedCount,
        totalGrandUsd: Number(core.confirmed_total_grand_usd ?? 0),
        totalGrandKhr: Number(core.confirmed_total_grand_khr ?? 0),
        totalVatUsd: Number(core.confirmed_total_vat_usd ?? 0),
        totalVatKhr: Number(core.confirmed_total_vat_khr ?? 0),
        totalDiscountUsd: Number(core.confirmed_total_discount_usd ?? 0),
        totalDiscountKhr: Number(core.confirmed_total_discount_khr ?? 0),
        averageTicketUsd,
        averageTicketKhr,
        totalItemsSold: Number(core.confirmed_total_items_sold ?? 0),
      },
      paymentBreakdown: paymentBreakdown.map((row) => ({
        paymentMethod: row.payment_method,
        transactionCount: Number(row.transaction_count ?? 0),
        totalUsd: Number(row.total_usd ?? 0),
        totalKhr: Number(row.total_khr ?? 0),
      })),
      cashTenderBreakdown: cashTenderBreakdown.map((row) => ({
        tenderCurrency: row.tender_currency,
        transactionCount: Number(row.transaction_count ?? 0),
        totalTenderAmount: Number(row.total_tender_amount ?? 0),
      })),
      saleTypeBreakdown: saleTypeBreakdown.map((row) => ({
        saleType: row.sale_type,
        transactionCount: Number(row.transaction_count ?? 0),
        totalUsd: Number(row.total_usd ?? 0),
        totalKhr: Number(row.total_khr ?? 0),
        totalItemsSold: Number(row.total_items_sold ?? 0),
      })),
      topItems: topItems.map((row) => ({
        menuItemId: row.menu_item_id,
        itemNameSnapshot: row.item_name_snapshot,
        quantity: Number(row.quantity ?? 0),
        revenueUsd: Number(row.revenue_usd ?? 0),
        revenueKhr: Number(row.revenue_khr ?? 0),
      })),
      categoryBreakdown: category.map((row) => ({
        categoryNameSnapshot: row.category_name_snapshot,
        quantity: Number(row.quantity ?? 0),
        revenueUsd: Number(row.revenue_usd ?? 0),
        revenueKhr: Number(row.revenue_khr ?? 0),
      })),
      exceptions: {
        voidPending: {
          count: Number(core.void_pending_count ?? 0),
          totalUsd: Number(core.void_pending_total_usd ?? 0),
          totalKhr: Number(core.void_pending_total_khr ?? 0),
        },
        voided: {
          count: Number(core.voided_count ?? 0),
          totalUsd: Number(core.voided_total_usd ?? 0),
          totalKhr: Number(core.voided_total_khr ?? 0),
        },
      },
    };
  }

  async getSalesDrillDown(input: {
    actor: ActorContext;
    query: {
      window?: unknown;
      from?: unknown;
      to?: unknown;
      branchScope?: unknown;
      branchId?: unknown;
      status?: unknown;
      limit?: unknown;
      offset?: unknown;
    };
  }): Promise<Record<string, unknown>> {
    const scope = await this.resolveScope({
      actor: input.actor,
      branchScope: input.query.branchScope,
      branchId: input.query.branchId,
    });
    const window = resolveWindow({
      window: input.query.window,
      from: input.query.from,
      to: input.query.to,
      allowedWindows: ["day", "week", "month", "custom"],
    });
    const statusFilter = parseSalesStatusFilter(input.query.status);
    const limit = normalizeLimit(input.query.limit);
    const offset = normalizeOffset(input.query.offset);

    const [items, total] = await Promise.all([
      this.repo.listSalesDrillDown({
        tenantId: scope.tenantId,
        fromInclusive: window.fromInclusive,
        toExclusive: window.toExclusive,
        branchIds: scope.branchIds,
        statusFilter,
        limit,
        offset,
      }),
      this.repo.countSalesDrillDown({
        tenantId: scope.tenantId,
        fromInclusive: window.fromInclusive,
        toExclusive: window.toExclusive,
        branchIds: scope.branchIds,
        statusFilter,
      }),
    ]);
    const page = buildOffsetPaginatedResult({
      items: items.map((row) => ({
        saleId: row.sale_id,
        branchId: row.branch_id,
        status: row.status,
        paymentMethod: row.payment_method,
        saleType: row.sale_type,
        finalizedAt: row.finalized_at ? row.finalized_at.toISOString() : null,
        totalItems: Number(row.total_items ?? 0),
        grandTotalUsd: Number(row.grand_total_usd ?? 0),
        grandTotalKhr: Number(row.grand_total_khr ?? 0),
        vatUsd: Number(row.vat_usd ?? 0),
        vatKhr: Number(row.vat_khr ?? 0),
        discountUsd: Number(row.discount_usd ?? 0),
        discountKhr: Number(row.discount_khr ?? 0),
      })),
      limit,
      offset,
      total,
    });

    return {
      scope: buildScopeEcho(scope, window),
      ...page,
    };
  }

  async getRestockSpendSummary(input: {
    actor: ActorContext;
    query: {
      window?: unknown;
      from?: unknown;
      to?: unknown;
      branchScope?: unknown;
      branchId?: unknown;
    };
  }): Promise<Record<string, unknown>> {
    const scope = await this.resolveScope({
      actor: input.actor,
      branchScope: input.query.branchScope,
      branchId: input.query.branchId,
    });
    const window = resolveWindow({
      window: input.query.window,
      from: input.query.from,
      to: input.query.to,
      allowedWindows: ["month", "custom"],
    });

    const [totals, monthlyBreakdown] = await Promise.all([
      this.repo.getRestockSpendSummary({
        tenantId: scope.tenantId,
        fromInclusive: window.fromInclusive,
        toExclusive: window.toExclusive,
        branchIds: scope.branchIds,
      }),
      this.repo.listRestockSpendMonthlyBreakdown({
        tenantId: scope.tenantId,
        fromInclusive: window.fromInclusive,
        toExclusive: window.toExclusive,
        branchIds: scope.branchIds,
      }),
    ]);

    return {
      scope: buildScopeEcho(scope, window),
      totals: {
        knownCostSpendUsd: Number(totals.known_cost_spend_usd ?? 0),
        knownCostBatchCount: Number(totals.known_cost_batch_count ?? 0),
        unknownCostBatchCount: Number(totals.unknown_cost_batch_count ?? 0),
      },
      monthlyBreakdown: monthlyBreakdown.map((row) => ({
        month: row.month,
        knownCostSpendUsd: Number(row.known_cost_spend_usd ?? 0),
        knownCostBatchCount: Number(row.known_cost_batch_count ?? 0),
        unknownCostBatchCount: Number(row.unknown_cost_batch_count ?? 0),
      })),
    };
  }

  async getRestockSpendDrillDown(input: {
    actor: ActorContext;
    query: {
      window?: unknown;
      from?: unknown;
      to?: unknown;
      branchScope?: unknown;
      branchId?: unknown;
      costFilter?: unknown;
      limit?: unknown;
      offset?: unknown;
    };
  }): Promise<Record<string, unknown>> {
    const scope = await this.resolveScope({
      actor: input.actor,
      branchScope: input.query.branchScope,
      branchId: input.query.branchId,
    });
    const window = resolveWindow({
      window: input.query.window,
      from: input.query.from,
      to: input.query.to,
      allowedWindows: ["month", "custom"],
    });
    const costFilter = parseRestockCostFilter(input.query.costFilter);
    const limit = normalizeLimit(input.query.limit);
    const offset = normalizeOffset(input.query.offset);

    const [items, total] = await Promise.all([
      this.repo.listRestockSpendDrillDown({
        tenantId: scope.tenantId,
        fromInclusive: window.fromInclusive,
        toExclusive: window.toExclusive,
        branchIds: scope.branchIds,
        costFilter,
        limit,
        offset,
      }),
      this.repo.countRestockSpendDrillDown({
        tenantId: scope.tenantId,
        fromInclusive: window.fromInclusive,
        toExclusive: window.toExclusive,
        branchIds: scope.branchIds,
        costFilter,
      }),
    ]);
    const page = buildOffsetPaginatedResult({
      items: items.map((row) => ({
        restockBatchId: row.restock_batch_id,
        branchId: row.branch_id,
        stockItemId: row.stock_item_id,
        stockItemName: row.stock_item_name,
        quantityInBaseUnit: Number(row.quantity_in_base_unit ?? 0),
        purchaseCostUsd: row.purchase_cost_usd === null ? null : Number(row.purchase_cost_usd),
        receivedAt: row.received_at.toISOString(),
      })),
      limit,
      offset,
      total,
    });

    return {
      scope: buildScopeEcho(scope, window),
      ...page,
    };
  }

  async getAttendanceSummary(_input: {
    actor: ActorContext;
    query: Record<string, unknown>;
  }): Promise<never> {
    throw new V0ReportingError(
      503,
      "attendance reporting is not available yet",
      "REPORT_NOT_AVAILABLE"
    );
  }

  async getAttendanceDrillDown(_input: {
    actor: ActorContext;
    query: Record<string, unknown>;
  }): Promise<never> {
    throw new V0ReportingError(
      503,
      "attendance reporting is not available yet",
      "REPORT_NOT_AVAILABLE"
    );
  }

  private async resolveScope(input: ResolveScopeInput): Promise<ResolvedScope> {
    const accountId = normalizeRequiredActorValue(
      input.actor.accountId,
      401,
      "authentication required",
      "INVALID_ACCESS_TOKEN"
    );
    const tenantId = normalizeRequiredActorValue(
      input.actor.tenantId,
      403,
      "tenant context required",
      "TENANT_CONTEXT_REQUIRED"
    );

    const requestedScope = parseBranchScope(input.branchScope);
    const membership = await this.repo.getActiveTenantMembership({
      tenantId,
      accountId,
    });
    if (!membership) {
      throw new V0ReportingError(403, "no active membership", "NO_MEMBERSHIP");
    }

    const roleKey = normalizeRoleKey(membership.role_key);
    const [tenantBranches, accessibleBranches] = await Promise.all([
      this.repo.listTenantBranches({ tenantId }),
      this.repo.listAccessibleBranchesForAccount({ tenantId, accountId }),
    ]);
    const tenantBranchMap = new Map(tenantBranches.map((branch) => [branch.branch_id, branch]));
    const accessibleBranchIds = new Set(accessibleBranches.map((branch) => branch.branch_id));

    if (requestedScope === "BRANCH") {
      const selectedBranchId = resolveSelectedBranchId(input.branchId, input.actor.branchId);
      const branch = tenantBranchMap.get(selectedBranchId);
      if (!branch) {
        throw new V0ReportingError(404, "branch not found", "BRANCH_NOT_FOUND");
      }
      if (!accessibleBranchIds.has(selectedBranchId)) {
        throw new V0ReportingError(403, "no branch access", "NO_BRANCH_ACCESS");
      }

      return {
        tenantId,
        branchScope: "BRANCH",
        branchId: selectedBranchId,
        branchIds: [selectedBranchId],
        frozenBranchIds: isFrozenBranch(branch) ? [selectedBranchId] : [],
      };
    }

    if (roleKey !== "OWNER" && roleKey !== "ADMIN") {
      throw new V0ReportingError(
        403,
        "all-branches scope is not allowed for this role",
        "REPORT_BRANCH_SCOPE_FORBIDDEN"
      );
    }

    if (tenantBranches.length === 0) {
      throw new V0ReportingError(422, "report scope has no branches", "REPORT_SCOPE_INVALID");
    }

    const inaccessibleBranchIds = tenantBranches
      .map((branch) => branch.branch_id)
      .filter((branchId) => !accessibleBranchIds.has(branchId));
    if (inaccessibleBranchIds.length > 0) {
      throw new V0ReportingError(
        403,
        "all-branches scope requires full branch access",
        "REPORT_ALL_BRANCHES_REQUIRES_FULL_BRANCH_ACCESS",
        { inaccessibleBranchIds }
      );
    }

    return {
      tenantId,
      branchScope: "ALL_BRANCHES",
      branchId: null,
      branchIds: tenantBranches.map((branch) => branch.branch_id),
      frozenBranchIds: tenantBranches
        .filter((branch) => isFrozenBranch(branch))
        .map((branch) => branch.branch_id),
    };
  }
}

function resolveWindow(input: {
  window: unknown;
  from: unknown;
  to: unknown;
  allowedWindows: ReadonlyArray<V0ReportingWindow>;
}): ResolvedWindow {
  const window = parseWindow(input.window);
  if (!input.allowedWindows.includes(window)) {
    throw new V0ReportingError(
      422,
      `window must be one of: ${input.allowedWindows.join(", ")}`,
      "REPORT_TIME_WINDOW_INVALID"
    );
  }

  if (window === "custom") {
    const fromDate = parseDateOnly(input.from, "from");
    const toDate = parseDateOnly(input.to, "to");
    if (fromDate > toDate) {
      throw new V0ReportingError(
        422,
        "from must be <= to for custom window",
        "REPORT_TIME_WINDOW_INVALID"
      );
    }
    return {
      fromDate,
      toDate,
      fromInclusive: phnomDateStartToUtc(fromDate),
      toExclusive: phnomDateStartToUtc(addDays(toDate, 1)),
    };
  }

  const now = getPhnomNowYmd();
  if (window === "day") {
    return {
      fromDate: now,
      toDate: now,
      fromInclusive: phnomDateStartToUtc(now),
      toExclusive: phnomDateStartToUtc(addDays(now, 1)),
    };
  }

  if (window === "week") {
    const dayOfWeek = getDayOfWeek(now);
    const start = addDays(now, -dayOfWeek);
    const end = addDays(start, 6);
    return {
      fromDate: start,
      toDate: end,
      fromInclusive: phnomDateStartToUtc(start),
      toExclusive: phnomDateStartToUtc(addDays(end, 1)),
    };
  }

  const monthStart = `${now.slice(0, 8)}01`;
  const monthEnd = addDays(addMonths(monthStart, 1), -1);
  return {
    fromDate: monthStart,
    toDate: monthEnd,
    fromInclusive: phnomDateStartToUtc(monthStart),
    toExclusive: phnomDateStartToUtc(addDays(monthEnd, 1)),
  };
}

function buildScopeEcho(scope: ResolvedScope, window: ResolvedWindow): ReportScopeEcho {
  return {
    tenantId: scope.tenantId,
    branchScope: scope.branchScope,
    branchId: scope.branchId,
    from: window.fromDate,
    to: window.toDate,
    timezone: PHNOM_PENH_TIMEZONE,
    frozenBranchIds: scope.frozenBranchIds,
  };
}

function normalizeRequiredActorValue(
  value: string | null | undefined,
  statusCode: number,
  message: string,
  code: string
): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new V0ReportingError(statusCode, message, code);
  }
  return normalized;
}

function parseBranchScope(value: unknown): ReportBranchScope {
  const normalized = String(value ?? "BRANCH").trim().toUpperCase();
  if (normalized === "BRANCH" || normalized === "ALL_BRANCHES") {
    return normalized;
  }
  throw new V0ReportingError(422, "branchScope must be BRANCH or ALL_BRANCHES", "REPORT_SCOPE_INVALID");
}

function resolveSelectedBranchId(branchId: unknown, fallbackBranchId: string | null): string {
  const explicit = String(branchId ?? "").trim();
  const selected = explicit || String(fallbackBranchId ?? "").trim();
  if (!selected) {
    throw new V0ReportingError(403, "branch context required", "BRANCH_CONTEXT_REQUIRED");
  }
  if (!UUID_REGEX.test(selected)) {
    throw new V0ReportingError(422, "branchId must be a valid UUID", "REPORT_SCOPE_INVALID");
  }
  return selected;
}

function normalizeRoleKey(value: string): MembershipRole {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (
    normalized === "OWNER" ||
    normalized === "ADMIN" ||
    normalized === "MANAGER" ||
    normalized === "CASHIER"
  ) {
    return normalized;
  }
  return "CASHIER";
}

function parseWindow(value: unknown): V0ReportingWindow {
  const normalized = String(value ?? "day").trim().toLowerCase();
  if (
    normalized === "day" ||
    normalized === "week" ||
    normalized === "month" ||
    normalized === "custom"
  ) {
    return normalized;
  }
  throw new V0ReportingError(
    422,
    "window must be one of: day, week, month, custom",
    "REPORT_TIME_WINDOW_INVALID"
  );
}

function parseDateOnly(value: unknown, field: string): string {
  const normalized = String(value ?? "").trim();
  if (!DATE_ONLY_REGEX.test(normalized)) {
    throw new V0ReportingError(
      422,
      `${field} must be in YYYY-MM-DD format`,
      "REPORT_TIME_WINDOW_INVALID"
    );
  }

  const [yearRaw, monthRaw, dayRaw] = normalized.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const probe = new Date(Date.UTC(year, month - 1, day));
  const isSameDate =
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() + 1 === month &&
    probe.getUTCDate() === day;
  if (!isSameDate) {
    throw new V0ReportingError(
      422,
      `${field} must be a valid calendar date`,
      "REPORT_TIME_WINDOW_INVALID"
    );
  }
  return normalized;
}

function parseSalesStatusFilter(value: unknown): V0ReportingSalesStatusFilter {
  const normalized = String(value ?? "ALL").trim().toUpperCase();
  if (
    normalized === "ALL" ||
    normalized === "FINALIZED" ||
    normalized === "VOID_PENDING" ||
    normalized === "VOIDED"
  ) {
    return normalized;
  }
  throw new V0ReportingError(
    422,
    "status must be ALL | FINALIZED | VOID_PENDING | VOIDED",
    "REPORT_FILTER_INVALID"
  );
}

function parseRestockCostFilter(value: unknown): V0ReportingRestockCostFilter {
  const normalized = String(value ?? "ALL").trim().toUpperCase();
  if (normalized === "ALL" || normalized === "KNOWN" || normalized === "UNKNOWN") {
    return normalized;
  }
  throw new V0ReportingError(
    422,
    "costFilter must be ALL | KNOWN | UNKNOWN",
    "REPORT_FILTER_INVALID"
  );
}

function normalizeTopN(value: unknown): number {
  const parsed = Number(value ?? 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 10;
  }
  return Math.min(Math.floor(parsed), 100);
}

function normalizeLimit(value: unknown): number {
  const parsed = Number(value ?? 50);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }
  return Math.min(Math.floor(parsed), 200);
}

function normalizeOffset(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.floor(parsed);
}

function getPhnomNowYmd(): string {
  const nowUtcMs = Date.now();
  const phnomDate = new Date(nowUtcMs + PHNOM_PENH_OFFSET_HOURS * 60 * 60 * 1000);
  const year = phnomDate.getUTCFullYear();
  const month = phnomDate.getUTCMonth() + 1;
  const day = phnomDate.getUTCDate();
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function getDayOfWeek(dateOnly: string): number {
  const [yearRaw, monthRaw, dayRaw] = dateOnly.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (utcDay + 6) % 7;
}

function addMonths(dateOnly: string, months: number): string {
  const [yearRaw, monthRaw] = dateOnly.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const d = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-01`;
}

function addDays(dateOnly: string, deltaDays: number): string {
  const [yearRaw, monthRaw, dayRaw] = dateOnly.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function phnomDateStartToUtc(dateOnly: string): Date {
  const [yearRaw, monthRaw, dayRaw] = dateOnly.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  return new Date(Date.UTC(year, month - 1, day, -PHNOM_PENH_OFFSET_HOURS, 0, 0, 0));
}

function isFrozenBranch(branch: V0ReportingBranchAccessRow): boolean {
  return String(branch.branch_status ?? "").trim().toUpperCase() === "FROZEN";
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
