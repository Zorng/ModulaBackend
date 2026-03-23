import {
  type DiscountRuleRow,
  type DiscountScope,
  type DiscountRuleStatus,
  V0DiscountRepository,
} from "../infra/repository.js";
import {
  buildOffsetPaginatedResult,
  type OffsetPaginatedResult,
} from "../../../../../shared/pagination.js";

type ActorContext = {
  accountId: string;
  tenantId: string | null;
  branchId: string | null;
};

type ListStatusFilter = "active" | "inactive" | "archived" | "all";
type ListScopeFilter = "item" | "branch_wide" | "all";

type DiscountScheduleDto = {
  startAt: string | null;
  endAt: string | null;
};

type DiscountRuleDto = {
  id: string;
  tenantId: string;
  branchId: string;
  name: string;
  percentage: number;
  scope: DiscountScope;
  status: DiscountRuleStatus;
  itemIds: string[];
  schedule: DiscountScheduleDto;
  stackingPolicy: "MULTIPLICATIVE";
  createdAt: string;
  updatedAt: string;
};

type DiscountEligibilityRuleDto = {
  ruleId: string;
  percentage: number;
  scope: DiscountScope;
  itemIds: string[];
  stackingPolicy: "MULTIPLICATIVE";
};

export class V0DiscountError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code?: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "V0DiscountError";
  }
}

export class V0DiscountService {
  constructor(private readonly repo: V0DiscountRepository) {}

  async listRules(input: {
    actor: ActorContext;
    status?: string;
    scope?: string;
    branchId?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<OffsetPaginatedResult<DiscountRuleDto>> {
    const actor = assertTenantContext(input.actor);
    const status = parseStatusFilter(input.status);
    const ruleScope = parseScopeFilter(input.scope);
    const branchId = parseOptionalUuid(input.branchId, "branchId");
    if (branchId) {
      await this.assertBranchActive(actor.tenantId, branchId);
    }
    const search = normalizeOptionalString(input.search);
    const limit = normalizeLimit(input.limit);
    const offset = normalizeOffset(input.offset);

    const rows = await this.repo.listRules({
      tenantId: actor.tenantId,
      status: mapStatusFilter(status),
      scope: mapScopeFilter(ruleScope),
      branchId,
      search,
      limit,
      offset,
    });

    const items = await this.hydrateRules(actor.tenantId, rows);
    const total = await this.repo.countRules({
      tenantId: actor.tenantId,
      status: mapStatusFilter(status),
      scope: mapScopeFilter(ruleScope),
      branchId,
      search,
    });
    return buildOffsetPaginatedResult({
      items,
      limit,
      offset,
      total,
    });
  }

  async getRule(input: {
    actor: ActorContext;
    ruleId: string;
  }): Promise<DiscountRuleDto> {
    const actor = assertTenantContext(input.actor);
    const ruleId = parseRequiredUuid(input.ruleId, "ruleId");
    const row = await this.repo.getRuleById({
      tenantId: actor.tenantId,
      ruleId,
    });
    if (!row) {
      throw new V0DiscountError(404, "discount rule not found", "DISCOUNT_RULE_NOT_FOUND");
    }

    const itemIds = await this.repo.listRuleItemIds({ tenantId: actor.tenantId, ruleId });
    return mapRuleRow(row, itemIds);
  }

  async createRule(input: {
    actor: ActorContext;
    body: unknown;
  }): Promise<DiscountRuleDto> {
    const actor = assertTenantContext(input.actor);
    const body = parseCreateBody(input.body);

    await this.assertBranchActive(actor.tenantId, body.branchId);
    await this.assertItemTargetsEligible({
      tenantId: actor.tenantId,
      branchId: body.branchId,
      scope: body.scope,
      itemIds: body.itemIds,
    });

    const overlapRuleIds = await this.findOverlapRuleIds({
      tenantId: actor.tenantId,
      branchId: body.branchId,
      scope: body.scope,
      itemIds: body.itemIds,
      startAt: body.startAt,
      endAt: body.endAt,
    });
    if (overlapRuleIds.length > 0 && !body.confirmOverlap) {
      throw new V0DiscountError(
        409,
        "discount overlaps existing active rules; explicit confirm required",
        "DISCOUNT_RULE_OVERLAP_WARNING",
        { conflictingRuleIds: overlapRuleIds }
      );
    }

    const row = await this.repo.createRule({
      tenantId: actor.tenantId,
      branchId: body.branchId,
      name: body.name,
      percentage: body.percentage,
      scope: body.scope,
      status: "INACTIVE",
      startAt: body.startAt,
      endAt: body.endAt,
    });

    await this.repo.replaceRuleItems({
      tenantId: actor.tenantId,
      ruleId: row.id,
      itemIds: body.scope === "ITEM" ? body.itemIds : [],
    });

    return mapRuleRow(row, body.scope === "ITEM" ? body.itemIds : []);
  }

  async updateRule(input: {
    actor: ActorContext;
    ruleId: string;
    body: unknown;
  }): Promise<DiscountRuleDto> {
    const actor = assertTenantContext(input.actor);
    const ruleId = parseRequiredUuid(input.ruleId, "ruleId");
    const patch = parseUpdateBody(input.body);

    const current = await this.repo.getRuleById({
      tenantId: actor.tenantId,
      ruleId,
    });
    if (!current) {
      throw new V0DiscountError(404, "discount rule not found", "DISCOUNT_RULE_NOT_FOUND");
    }

    const now = new Date();
    if (isCurrentlyEligible(current, now)) {
      throw new V0DiscountError(
        409,
        "rule is currently eligible; deactivate or wait until inactive window to edit",
        "DISCOUNT_RULE_UPDATE_REQUIRES_EFFECTIVE_INACTIVE"
      );
    }

    if (patch.branchId && patch.branchId !== current.branch_id) {
      throw new V0DiscountError(
        422,
        "branchId is immutable for discount rules",
        "DISCOUNT_RULE_INVALID"
      );
    }

    const currentItemIds = await this.repo.listRuleItemIds({
      tenantId: actor.tenantId,
      ruleId,
    });

    const nextScope = patch.scope ?? current.scope;
    const nextItemIds = nextScope === "ITEM" ? patch.itemIds ?? currentItemIds : [];
    const nextName = patch.name ?? current.name;
    const nextPercentage = patch.percentage ?? current.percentage;
    const nextStartAt: Date | null = patch.startAtProvided
      ? (patch.startAt ?? null)
      : current.start_at;
    const nextEndAt: Date | null = patch.endAtProvided
      ? (patch.endAt ?? null)
      : current.end_at;
    const nextConfirmOverlap = patch.confirmOverlap ?? false;

    if (nextScope === "ITEM" && nextItemIds.length === 0) {
      throw new V0DiscountError(
        422,
        "item-level discount must include at least one item",
        "DISCOUNT_ITEM_ASSIGNMENT_REQUIRED"
      );
    }
    if (nextStartAt && nextEndAt && nextStartAt >= nextEndAt) {
      throw new V0DiscountError(
        422,
        "schedule startAt must be before endAt",
        "DISCOUNT_RULE_INVALID"
      );
    }

    await this.assertItemTargetsEligible({
      tenantId: actor.tenantId,
      branchId: current.branch_id,
      scope: nextScope,
      itemIds: nextItemIds,
    });

    const overlapRuleIds = await this.findOverlapRuleIds({
      tenantId: actor.tenantId,
      branchId: current.branch_id,
      scope: nextScope,
      itemIds: nextItemIds,
      startAt: nextStartAt,
      endAt: nextEndAt,
      excludeRuleId: ruleId,
    });
    if (overlapRuleIds.length > 0 && !nextConfirmOverlap) {
      throw new V0DiscountError(
        409,
        "discount overlaps existing active rules; explicit confirm required",
        "DISCOUNT_RULE_OVERLAP_WARNING",
        { conflictingRuleIds: overlapRuleIds }
      );
    }

    const updated = await this.repo.updateRuleDefinition({
      tenantId: actor.tenantId,
      ruleId,
      name: nextName,
      percentage: nextPercentage,
      scope: nextScope,
      startAt: nextStartAt,
      endAt: nextEndAt,
    });
    if (!updated) {
      throw new V0DiscountError(404, "discount rule not found", "DISCOUNT_RULE_NOT_FOUND");
    }

    await this.repo.replaceRuleItems({
      tenantId: actor.tenantId,
      ruleId,
      itemIds: nextScope === "ITEM" ? nextItemIds : [],
    });

    return mapRuleRow(updated, nextScope === "ITEM" ? nextItemIds : []);
  }

  async activateRule(input: {
    actor: ActorContext;
    ruleId: string;
    body?: unknown;
  }): Promise<DiscountRuleDto> {
    return this.updateRuleStatus({
      actor: input.actor,
      ruleId: input.ruleId,
      status: "ACTIVE",
      body: input.body,
    });
  }

  async deactivateRule(input: {
    actor: ActorContext;
    ruleId: string;
    body?: unknown;
  }): Promise<DiscountRuleDto> {
    return this.updateRuleStatus({
      actor: input.actor,
      ruleId: input.ruleId,
      status: "INACTIVE",
      body: input.body,
    });
  }

  async archiveRule(input: {
    actor: ActorContext;
    ruleId: string;
    body?: unknown;
  }): Promise<DiscountRuleDto> {
    return this.updateRuleStatus({
      actor: input.actor,
      ruleId: input.ruleId,
      status: "ARCHIVED",
      body: input.body,
    });
  }

  async resolveEligibleItemsForBranch(input: {
    actor: ActorContext;
    body: unknown;
  }): Promise<{ branchId: string; eligibleItemIds: string[]; invalidItemIds: string[]; allEligible: boolean }> {
    const actor = assertTenantContext(input.actor);
    const body = parsePreflightBody(input.body);

    await this.assertBranchActive(actor.tenantId, body.branchId);

    const eligibleItemIds = await this.repo.resolveEligibleItemIdsForBranch({
      tenantId: actor.tenantId,
      branchId: body.branchId,
      itemIds: body.itemIds,
    });
    const eligibleSet = new Set(eligibleItemIds);
    const invalidItemIds = body.itemIds.filter((itemId) => !eligibleSet.has(itemId));

    return {
      branchId: body.branchId,
      eligibleItemIds,
      invalidItemIds,
      allEligible: invalidItemIds.length === 0,
    };
  }

  async resolveEligibility(input: {
    actor: ActorContext;
    body: unknown;
  }): Promise<{ rules: DiscountEligibilityRuleDto[] }> {
    const actor = assertTenantContext(input.actor);
    const payload = parseEligibilityBody(input.body);
    await this.assertBranchActive(actor.tenantId, payload.branchId);
    const activeRules = await this.repo.listActiveRulesForBranchAt({
      tenantId: actor.tenantId,
      branchId: payload.branchId,
      occurredAt: payload.occurredAt,
    });
    if (activeRules.length === 0) {
      return { rules: [] };
    }

    const ruleIds = activeRules.map((rule) => rule.id);
    const itemRows = await this.repo.listRuleItemsByRuleIds({
      tenantId: actor.tenantId,
      ruleIds,
    });
    const ruleItemMap = buildRuleItemMap(itemRows);
    const lineItemIds = new Set(payload.lines.map((line) => line.menuItemId));

    const rules: DiscountEligibilityRuleDto[] = [];
    for (const rule of activeRules) {
      const itemIds = ruleItemMap.get(rule.id) ?? [];
      if (rule.scope === "ITEM") {
        const hasTargetedItem = itemIds.some((itemId) => lineItemIds.has(itemId));
        if (!hasTargetedItem) {
          continue;
        }
      }
      rules.push({
        ruleId: rule.id,
        percentage: rule.percentage,
        scope: rule.scope,
        itemIds,
        stackingPolicy: "MULTIPLICATIVE",
      });
    }

    return { rules };
  }

  private async updateRuleStatus(input: {
    actor: ActorContext;
    ruleId: string;
    status: DiscountRuleStatus;
    body?: unknown;
  }): Promise<DiscountRuleDto> {
    const actor = assertTenantContext(input.actor);
    const ruleId = parseRequiredUuid(input.ruleId, "ruleId");
    const body = parseStatusTransitionBody(input.body);
    const updated = await this.repo.updateRuleStatus({
      tenantId: actor.tenantId,
      ruleId,
      status: input.status,
      expectedUpdatedAt: body.expectedUpdatedAt,
    });
    if (!updated) {
      const current = await this.repo.getRuleById({
        tenantId: actor.tenantId,
        ruleId,
      });
      if (!current) {
        throw new V0DiscountError(404, "discount rule not found", "DISCOUNT_RULE_NOT_FOUND");
      }
      if (
        body.expectedUpdatedAt &&
        current.updated_at.getTime() !== body.expectedUpdatedAt.getTime()
      ) {
        throw new V0DiscountError(
          409,
          "discount rule changed since last read; refresh and retry",
          "DISCOUNT_RULE_STATE_CONFLICT",
          {
            currentStatus: current.status,
            currentUpdatedAt: current.updated_at.toISOString(),
          }
        );
      }
      throw new V0DiscountError(409, "discount rule status update conflict", "DISCOUNT_RULE_STATE_CONFLICT");
    }

    const itemIds = await this.repo.listRuleItemIds({ tenantId: actor.tenantId, ruleId });
    return mapRuleRow(updated, itemIds);
  }

  private async assertBranchActive(tenantId: string, branchId: string): Promise<void> {
    const branchOk = await this.repo.branchExistsAndActive({ tenantId, branchId });
    if (!branchOk) {
      throw new V0DiscountError(422, "branch is invalid or inactive", "DISCOUNT_RULE_INVALID");
    }
  }

  private async assertItemTargetsEligible(input: {
    tenantId: string;
    branchId: string;
    scope: DiscountScope;
    itemIds: readonly string[];
  }): Promise<void> {
    if (input.scope !== "ITEM") {
      return;
    }
    const eligibleItemIds = await this.repo.resolveEligibleItemIdsForBranch({
      tenantId: input.tenantId,
      branchId: input.branchId,
      itemIds: input.itemIds,
    });
    const eligibleSet = new Set(eligibleItemIds);
    const invalidItemIds = input.itemIds.filter((itemId) => !eligibleSet.has(itemId));
    if (invalidItemIds.length > 0) {
      throw new V0DiscountError(
        422,
        "some selected items are not eligible in this branch",
        "DISCOUNT_RULE_INVALID",
        { invalidItemIds }
      );
    }
  }

  private async findOverlapRuleIds(input: {
    tenantId: string;
    branchId: string;
    scope: DiscountScope;
    itemIds: readonly string[];
    startAt: Date | null;
    endAt: Date | null;
    excludeRuleId?: string;
  }): Promise<string[]> {
    const candidates = await this.repo.listActiveRulesForBranch({
      tenantId: input.tenantId,
      branchId: input.branchId,
      excludeRuleId: input.excludeRuleId,
    });
    if (candidates.length === 0) {
      return [];
    }

    const itemRows = await this.repo.listRuleItemsByRuleIds({
      tenantId: input.tenantId,
      ruleIds: candidates.map((rule) => rule.id),
    });
    const candidateItemsMap = buildRuleItemMap(itemRows);
    const newItemSet = new Set(input.itemIds);
    const overlaps: string[] = [];

    for (const existing of candidates) {
      if (!schedulesOverlap(input.startAt, input.endAt, existing.start_at, existing.end_at)) {
        continue;
      }

      const targetOverlap = hasTargetOverlap({
        newScope: input.scope,
        newItemSet,
        existingScope: existing.scope,
        existingItemIds: candidateItemsMap.get(existing.id) ?? [],
      });
      if (!targetOverlap) {
        continue;
      }

      overlaps.push(existing.id);
    }

    return overlaps;
  }

  private async hydrateRules(
    tenantId: string,
    rows: readonly DiscountRuleRow[]
  ): Promise<DiscountRuleDto[]> {
    if (rows.length === 0) {
      return [];
    }
    const ruleIds = rows.map((row) => row.id);
    const itemRows = await this.repo.listRuleItemsByRuleIds({
      tenantId,
      ruleIds,
    });
    const itemMap = buildRuleItemMap(itemRows);
    return rows.map((row) => mapRuleRow(row, itemMap.get(row.id) ?? []));
  }
}

function assertTenantContext(actor: ActorContext): {
  accountId: string;
  tenantId: string;
} {
  const accountId = String(actor.accountId ?? "").trim();
  const tenantId = String(actor.tenantId ?? "").trim();
  if (!accountId) {
    throw new V0DiscountError(401, "authentication required");
  }
  if (!tenantId) {
    throw new V0DiscountError(403, "tenant context required", "TENANT_CONTEXT_REQUIRED");
  }
  return { accountId, tenantId };
}

function mapRuleRow(row: DiscountRuleRow, itemIds: string[]): DiscountRuleDto {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    name: row.name,
    percentage: row.percentage,
    scope: row.scope,
    status: row.status,
    itemIds,
    schedule: {
      startAt: row.start_at ? row.start_at.toISOString() : null,
      endAt: row.end_at ? row.end_at.toISOString() : null,
    },
    stackingPolicy: "MULTIPLICATIVE",
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function parseCreateBody(body: unknown): {
  name: string;
  branchId: string;
  percentage: number;
  scope: DiscountScope;
  itemIds: string[];
  startAt: Date | null;
  endAt: Date | null;
  confirmOverlap: boolean;
} {
  const source = toObject(body);
  const name = parseRequiredNonEmptyString(source.name, "name");
  const branchId = parseRequiredUuid(source.branchId, "branchId");
  const percentage = parsePercentage(source.percentage);
  const scope = parseDiscountScope(source.scope);
  const itemIds = scope === "ITEM" ? parseUuidArray(source.itemIds, "itemIds", false) : [];
  if (scope === "ITEM" && itemIds.length === 0) {
    throw new V0DiscountError(
      422,
      "item-level discount must include at least one item",
      "DISCOUNT_ITEM_ASSIGNMENT_REQUIRED"
    );
  }

  const schedule = parseScheduleObject(source.schedule);
  if (schedule.startAt && schedule.endAt && schedule.startAt >= schedule.endAt) {
    throw new V0DiscountError(
      422,
      "schedule startAt must be before endAt",
      "DISCOUNT_RULE_INVALID"
    );
  }

  return {
    name,
    branchId,
    percentage,
    scope,
    itemIds,
    startAt: schedule.startAt,
    endAt: schedule.endAt,
    confirmOverlap: parseBooleanDefault(source.confirmOverlap, false),
  };
}

function parseUpdateBody(body: unknown): {
  name?: string;
  branchId?: string;
  percentage?: number;
  scope?: DiscountScope;
  itemIds?: string[];
  startAt?: Date | null;
  endAt?: Date | null;
  startAtProvided: boolean;
  endAtProvided: boolean;
  confirmOverlap?: boolean;
} {
  const source = toObject(body);
  const patch: {
    name?: string;
    branchId?: string;
    percentage?: number;
    scope?: DiscountScope;
    itemIds?: string[];
    startAt?: Date | null;
    endAt?: Date | null;
    startAtProvided: boolean;
    endAtProvided: boolean;
    confirmOverlap?: boolean;
  } = {
    startAtProvided: false,
    endAtProvided: false,
  };

  if (hasOwn(source, "name")) {
    patch.name = parseRequiredNonEmptyString(source.name, "name");
  }
  if (hasOwn(source, "branchId")) {
    patch.branchId = parseRequiredUuid(source.branchId, "branchId");
  }
  if (hasOwn(source, "percentage")) {
    patch.percentage = parsePercentage(source.percentage);
  }
  if (hasOwn(source, "scope")) {
    patch.scope = parseDiscountScope(source.scope);
  }
  if (hasOwn(source, "itemIds")) {
    patch.itemIds = parseUuidArray(source.itemIds, "itemIds", true);
  }
  if (hasOwn(source, "schedule")) {
    const parsed = parseSchedulePatch(source.schedule);
    patch.startAt = parsed.startAt;
    patch.endAt = parsed.endAt;
    patch.startAtProvided = parsed.startAtProvided;
    patch.endAtProvided = parsed.endAtProvided;
  }
  if (hasOwn(source, "confirmOverlap")) {
    patch.confirmOverlap = parseBooleanDefault(source.confirmOverlap, false);
  }

  const hasBodyFields =
    hasOwn(source, "name") ||
    hasOwn(source, "branchId") ||
    hasOwn(source, "percentage") ||
    hasOwn(source, "scope") ||
    hasOwn(source, "itemIds") ||
    hasOwn(source, "schedule") ||
    hasOwn(source, "confirmOverlap");
  if (!hasBodyFields) {
    throw new V0DiscountError(422, "at least one field is required", "DISCOUNT_RULE_INVALID");
  }

  return patch;
}

function parsePreflightBody(body: unknown): { branchId: string; itemIds: string[] } {
  const source = toObject(body);
  const branchId = parseRequiredUuid(source.branchId, "branchId");
  const itemIds = parseUuidArray(source.itemIds, "itemIds", false);
  return { branchId, itemIds };
}

function parseEligibilityBody(body: unknown): {
  branchId: string;
  occurredAt: Date;
  lines: Array<{ menuItemId: string }>;
} {
  const source = toObject(body);
  const branchId = parseRequiredUuid(source.branchId, "branchId");
  const occurredAt = parseIsoDate(source.occurredAt, "occurredAt");
  if (!Array.isArray(source.lines)) {
    throw new V0DiscountError(422, "lines must be an array", "DISCOUNT_RULE_INVALID");
  }

  const lines = source.lines.map((line, index) => {
    if (!line || typeof line !== "object" || Array.isArray(line)) {
      throw new V0DiscountError(
        422,
        `lines[${index}] must be an object`,
        "DISCOUNT_RULE_INVALID"
      );
    }
    const value = line as Record<string, unknown>;
    return {
      menuItemId: parseRequiredUuid(value.menuItemId, `lines[${index}].menuItemId`),
    };
  });

  return { branchId, occurredAt, lines };
}

function parseStatusTransitionBody(body: unknown): { expectedUpdatedAt: Date | null } {
  if (body === undefined || body === null || body === "") {
    return { expectedUpdatedAt: null };
  }
  if (typeof body !== "object" || Array.isArray(body)) {
    throw new V0DiscountError(422, "request body must be an object", "DISCOUNT_RULE_INVALID");
  }
  const source = body as Record<string, unknown>;
  const allowedKeys = new Set(["expectedUpdatedAt"]);
  for (const key of Object.keys(source)) {
    if (!allowedKeys.has(key)) {
      throw new V0DiscountError(
        422,
        `${key} is not allowed for rule status transition`,
        "DISCOUNT_RULE_INVALID"
      );
    }
  }
  return {
    expectedUpdatedAt: hasOwn(source, "expectedUpdatedAt")
      ? parseOptionalIsoDate(source.expectedUpdatedAt, "expectedUpdatedAt")
      : null,
  };
}

function parseStatusFilter(value: string | undefined): ListStatusFilter {
  const normalized = normalizeOptionalString(value)?.toLowerCase() ?? "all";
  if (
    normalized !== "all" &&
    normalized !== "active" &&
    normalized !== "inactive" &&
    normalized !== "archived"
  ) {
    throw new V0DiscountError(422, "invalid status filter", "DISCOUNT_RULE_INVALID");
  }
  return normalized;
}

function parseScopeFilter(value: string | undefined): ListScopeFilter {
  const normalized = normalizeOptionalString(value)?.toLowerCase() ?? "all";
  if (normalized !== "all" && normalized !== "item" && normalized !== "branch_wide") {
    throw new V0DiscountError(422, "invalid scope filter", "DISCOUNT_SCOPE_INVALID");
  }
  return normalized;
}

function mapStatusFilter(value: ListStatusFilter): DiscountRuleStatus | null {
  if (value === "all") {
    return null;
  }
  if (value === "active") {
    return "ACTIVE";
  }
  if (value === "inactive") {
    return "INACTIVE";
  }
  return "ARCHIVED";
}

function mapScopeFilter(value: ListScopeFilter): DiscountScope | null {
  if (value === "all") {
    return null;
  }
  if (value === "item") {
    return "ITEM";
  }
  return "BRANCH_WIDE";
}

function parseDiscountScope(value: unknown): DiscountScope {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized !== "ITEM" && normalized !== "BRANCH_WIDE") {
    throw new V0DiscountError(422, "invalid discount scope", "DISCOUNT_SCOPE_INVALID");
  }
  return normalized;
}

function parsePercentage(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
    throw new V0DiscountError(
      422,
      "percentage must be greater than 0 and at most 100",
      "DISCOUNT_PERCENTAGE_OUT_OF_RANGE"
    );
  }
  return Number(parsed.toFixed(2));
}

function parseIsoDate(value: unknown, fieldName: string): Date {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new V0DiscountError(422, `${fieldName} is required`, "DISCOUNT_RULE_INVALID");
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new V0DiscountError(
      422,
      `${fieldName} must be a valid ISO datetime`,
      "DISCOUNT_RULE_INVALID"
    );
  }
  return parsed;
}

function parseScheduleObject(value: unknown): { startAt: Date | null; endAt: Date | null } {
  if (value === undefined || value === null) {
    return { startAt: null, endAt: null };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new V0DiscountError(422, "schedule must be an object", "DISCOUNT_RULE_INVALID");
  }
  const schedule = value as Record<string, unknown>;
  return {
    startAt: hasOwn(schedule, "startAt")
      ? parseOptionalIsoDate(schedule.startAt, "schedule.startAt")
      : null,
    endAt: hasOwn(schedule, "endAt")
      ? parseOptionalIsoDate(schedule.endAt, "schedule.endAt")
      : null,
  };
}

function parseSchedulePatch(value: unknown): {
  startAt: Date | null;
  endAt: Date | null;
  startAtProvided: boolean;
  endAtProvided: boolean;
} {
  if (value === null) {
    return {
      startAt: null,
      endAt: null,
      startAtProvided: true,
      endAtProvided: true,
    };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new V0DiscountError(422, "schedule must be an object", "DISCOUNT_RULE_INVALID");
  }
  const schedule = value as Record<string, unknown>;
  const startAtProvided = hasOwn(schedule, "startAt");
  const endAtProvided = hasOwn(schedule, "endAt");
  if (!startAtProvided && !endAtProvided) {
    throw new V0DiscountError(
      422,
      "schedule patch must provide startAt and/or endAt",
      "DISCOUNT_RULE_INVALID"
    );
  }

  return {
    startAt: startAtProvided ? parseOptionalIsoDate(schedule.startAt, "schedule.startAt") : null,
    endAt: endAtProvided ? parseOptionalIsoDate(schedule.endAt, "schedule.endAt") : null,
    startAtProvided,
    endAtProvided,
  };
}

function parseOptionalIsoDate(value: unknown, fieldName: string): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return parseIsoDate(value, fieldName);
}

function parseRequiredUuid(value: unknown, fieldName: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new V0DiscountError(422, `${fieldName} is required`, "DISCOUNT_RULE_INVALID");
  }
  if (!isUuid(normalized)) {
    throw new V0DiscountError(
      422,
      `${fieldName} must be a valid UUID`,
      "DISCOUNT_RULE_INVALID"
    );
  }
  return normalized;
}

function parseOptionalUuid(value: unknown, fieldName: string): string | null {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }
  if (!isUuid(normalized)) {
    throw new V0DiscountError(
      422,
      `${fieldName} must be a valid UUID`,
      "DISCOUNT_RULE_INVALID"
    );
  }
  return normalized;
}

function parseUuidArray(value: unknown, fieldName: string, allowEmpty: boolean): string[] {
  if (!Array.isArray(value)) {
    throw new V0DiscountError(422, `${fieldName} must be an array`, "DISCOUNT_RULE_INVALID");
  }
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < value.length; i += 1) {
    const item = parseRequiredUuid(value[i], `${fieldName}[${i}]`);
    if (!seen.has(item)) {
      deduped.push(item);
      seen.add(item);
    }
  }
  if (!allowEmpty && deduped.length === 0) {
    throw new V0DiscountError(
      422,
      `${fieldName} must include at least one id`,
      "DISCOUNT_RULE_INVALID"
    );
  }
  return deduped;
}

function parseRequiredNonEmptyString(value: unknown, fieldName: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new V0DiscountError(422, `${fieldName} is required`, "DISCOUNT_RULE_INVALID");
  }
  return normalized;
}

function parseBooleanDefault(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  if (typeof value !== "boolean") {
    throw new V0DiscountError(422, "confirmOverlap must be boolean", "DISCOUNT_RULE_INVALID");
  }
  return value;
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function normalizeLimit(value: number | undefined): number {
  const parsed = Number(value ?? 50);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 50;
  }
  return Math.min(200, Math.floor(parsed));
}

function normalizeOffset(value: number | undefined): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.floor(parsed);
}

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new V0DiscountError(422, "request body must be an object", "DISCOUNT_RULE_INVALID");
  }
  return value as Record<string, unknown>;
}

function hasOwn(target: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function buildRuleItemMap(
  rows: ReadonlyArray<{ rule_id: string; menu_item_id: string }>
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const row of rows) {
    const current = result.get(row.rule_id) ?? [];
    current.push(row.menu_item_id);
    result.set(row.rule_id, current);
  }
  for (const value of result.values()) {
    value.sort();
  }
  return result;
}

function hasTargetOverlap(input: {
  newScope: DiscountScope;
  newItemSet: ReadonlySet<string>;
  existingScope: DiscountScope;
  existingItemIds: readonly string[];
}): boolean {
  if (input.newScope === "BRANCH_WIDE" || input.existingScope === "BRANCH_WIDE") {
    return true;
  }
  return input.existingItemIds.some((itemId) => input.newItemSet.has(itemId));
}

function schedulesOverlap(
  aStart: Date | null,
  aEnd: Date | null,
  bStart: Date | null,
  bEnd: Date | null
): boolean {
  const aStartMs = aStart ? aStart.getTime() : Number.NEGATIVE_INFINITY;
  const aEndMs = aEnd ? aEnd.getTime() : Number.POSITIVE_INFINITY;
  const bStartMs = bStart ? bStart.getTime() : Number.NEGATIVE_INFINITY;
  const bEndMs = bEnd ? bEnd.getTime() : Number.POSITIVE_INFINITY;
  return aStartMs < bEndMs && bStartMs < aEndMs;
}

function isCurrentlyEligible(rule: DiscountRuleRow, now: Date): boolean {
  if (rule.status !== "ACTIVE") {
    return false;
  }
  const nowMs = now.getTime();
  const startMs = rule.start_at ? rule.start_at.getTime() : Number.NEGATIVE_INFINITY;
  const endMs = rule.end_at ? rule.end_at.getTime() : Number.POSITIVE_INFINITY;
  return startMs <= nowMs && nowMs < endMs;
}
