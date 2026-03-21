import {
  V0ShiftRepository,
  type V0ShiftInstanceRow,
  type V0ShiftInstanceStatus,
  type V0ShiftPatternRow,
  type V0ShiftPatternStatus,
  type V0TenantMembershipRow,
} from "../infra/repository.js";
import { buildOffsetPaginatedResult } from "../../../../../shared/pagination.js";

type ActorContext = {
  accountId: string;
  tenantId: string | null;
  branchId: string | null;
};

type PgError = {
  code?: string;
  constraint?: string;
};

export class V0ShiftError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code?: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "V0ShiftError";
  }
}

export class V0ShiftService {
  private readonly writeRoles = new Set(["OWNER", "ADMIN", "MANAGER"]);
  private readonly readRoles = new Set(["OWNER", "ADMIN", "MANAGER"]);

  constructor(private readonly repo: V0ShiftRepository) {}

  async createPattern(input: {
    actor: ActorContext;
    body: Record<string, unknown>;
  }) {
    const access = await this.assertWriteAccess(input.actor);
    const membershipId = parseUuid(input.body.membershipId, "membershipId");
    const branchId = parseUuid(input.body.branchId, "branchId");
    const daysOfWeek = parseDaysOfWeek(input.body.daysOfWeek);
    const plannedStartTime = parseTime(input.body.plannedStartTime, "plannedStartTime");
    const plannedEndTime = parseTime(input.body.plannedEndTime, "plannedEndTime");
    const effectiveFrom = parseOptionalDate(input.body.effectiveFrom, "effectiveFrom");
    const effectiveTo = parseOptionalDate(input.body.effectiveTo, "effectiveTo");
    const note = parseOptionalString(input.body.note);

    assertStartBeforeEnd(plannedStartTime, plannedEndTime);
    assertDateRange(effectiveFrom, effectiveTo);
    await this.assertPlanningTarget({
      tenantId: access.tenantId,
      membershipId,
      branchId,
    });

    try {
      const row = await this.repo.insertShiftPattern({
        tenantId: access.tenantId,
        membershipId,
        branchId,
        daysOfWeek,
        plannedStartTime,
        plannedEndTime,
        effectiveFrom,
        effectiveTo,
        note,
        actorAccountId: access.accountId,
      });
      return mapPattern(row);
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async updatePattern(input: {
    actor: ActorContext;
    patternId: string;
    body: Record<string, unknown>;
  }) {
    const access = await this.assertWriteAccess(input.actor);
    const patternId = parseUuid(input.patternId, "patternId");
    const current = await this.repo.findShiftPatternByIdInTenant({
      patternId,
      tenantId: access.tenantId,
    });
    if (!current) {
      throw new V0ShiftError(404, "shift pattern not found", "SHIFT_PATTERN_NOT_FOUND");
    }
    if (current.status === "INACTIVE") {
      throw new V0ShiftError(
        409,
        "inactive shift pattern cannot be updated",
        "SHIFT_PATTERN_INACTIVE"
      );
    }

    const membershipId = hasOwn(input.body, "membershipId")
      ? parseUuid(input.body.membershipId, "membershipId")
      : current.membership_id;
    const branchId = hasOwn(input.body, "branchId")
      ? parseUuid(input.body.branchId, "branchId")
      : current.branch_id;
    const daysOfWeek = hasOwn(input.body, "daysOfWeek")
      ? parseDaysOfWeek(input.body.daysOfWeek)
      : normalizeDaysOfWeek(current.days_of_week);
    const plannedStartTime = hasOwn(input.body, "plannedStartTime")
      ? parseTime(input.body.plannedStartTime, "plannedStartTime")
      : normalizeTime(current.planned_start_time);
    const plannedEndTime = hasOwn(input.body, "plannedEndTime")
      ? parseTime(input.body.plannedEndTime, "plannedEndTime")
      : normalizeTime(current.planned_end_time);
    const effectiveFrom = hasOwn(input.body, "effectiveFrom")
      ? parseOptionalDate(input.body.effectiveFrom, "effectiveFrom")
      : formatDateOnly(current.effective_from);
    const effectiveTo = hasOwn(input.body, "effectiveTo")
      ? parseOptionalDate(input.body.effectiveTo, "effectiveTo")
      : formatDateOnly(current.effective_to);
    const note = hasOwn(input.body, "note")
      ? parseOptionalString(input.body.note)
      : current.note;

    assertStartBeforeEnd(plannedStartTime, plannedEndTime);
    assertDateRange(effectiveFrom, effectiveTo);
    await this.assertPlanningTarget({
      tenantId: access.tenantId,
      membershipId,
      branchId,
    });

    try {
      const row = await this.repo.updateShiftPattern({
        patternId,
        tenantId: access.tenantId,
        membershipId,
        branchId,
        daysOfWeek,
        plannedStartTime,
        plannedEndTime,
        effectiveFrom,
        effectiveTo,
        note,
        actorAccountId: access.accountId,
      });
      if (!row) {
        throw new V0ShiftError(404, "shift pattern not found", "SHIFT_PATTERN_NOT_FOUND");
      }
      return mapPattern(row);
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async deactivatePattern(input: {
    actor: ActorContext;
    patternId: string;
  }) {
    const access = await this.assertWriteAccess(input.actor);
    const patternId = parseUuid(input.patternId, "patternId");

    const current = await this.repo.findShiftPatternByIdInTenant({
      patternId,
      tenantId: access.tenantId,
    });
    if (!current) {
      throw new V0ShiftError(404, "shift pattern not found", "SHIFT_PATTERN_NOT_FOUND");
    }
    if (current.status === "INACTIVE") {
      return mapPattern(current);
    }

    const row = await this.repo.deactivateShiftPattern({
      patternId,
      tenantId: access.tenantId,
      actorAccountId: access.accountId,
    });
    if (!row) {
      throw new V0ShiftError(404, "shift pattern not found", "SHIFT_PATTERN_NOT_FOUND");
    }
    return mapPattern(row);
  }

  async createInstance(input: {
    actor: ActorContext;
    body: Record<string, unknown>;
  }) {
    const access = await this.assertWriteAccess(input.actor);
    const membershipId = parseUuid(input.body.membershipId, "membershipId");
    const branchId = parseUuid(input.body.branchId, "branchId");
    const patternId = parseOptionalUuid(input.body.patternId, "patternId");
    const shiftDate = parseDate(input.body.date, "date");
    const plannedStartTime = parseTime(input.body.plannedStartTime, "plannedStartTime");
    const plannedEndTime = parseTime(input.body.plannedEndTime, "plannedEndTime");
    const note = parseOptionalString(input.body.note);

    assertStartBeforeEnd(plannedStartTime, plannedEndTime);
    await this.assertPlanningTarget({
      tenantId: access.tenantId,
      membershipId,
      branchId,
    });
    if (patternId) {
      const pattern = await this.repo.findShiftPatternByIdInTenant({
        patternId,
        tenantId: access.tenantId,
      });
      if (!pattern) {
        throw new V0ShiftError(404, "shift pattern not found", "SHIFT_PATTERN_NOT_FOUND");
      }
      if (pattern.membership_id !== membershipId || pattern.branch_id !== branchId) {
        throw new V0ShiftError(
          422,
          "pattern target does not match membership/branch",
          "SHIFT_MEMBERSHIP_INVALID"
        );
      }
    }

    try {
      const row = await this.repo.insertShiftInstance({
        tenantId: access.tenantId,
        membershipId,
        branchId,
        patternId,
        shiftDate,
        plannedStartTime,
        plannedEndTime,
        note,
        actorAccountId: access.accountId,
      });
      return mapInstance(row);
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async updateInstance(input: {
    actor: ActorContext;
    instanceId: string;
    body: Record<string, unknown>;
  }) {
    const access = await this.assertWriteAccess(input.actor);
    const instanceId = parseUuid(input.instanceId, "instanceId");
    const current = await this.repo.findShiftInstanceByIdInTenant({
      instanceId,
      tenantId: access.tenantId,
    });
    if (!current) {
      throw new V0ShiftError(404, "shift instance not found", "SHIFT_INSTANCE_NOT_FOUND");
    }
    if (current.status === "CANCELLED") {
      throw new V0ShiftError(409, "cancelled shift cannot be updated", "SHIFT_INSTANCE_CANCELLED");
    }

    const membershipId = hasOwn(input.body, "membershipId")
      ? parseUuid(input.body.membershipId, "membershipId")
      : current.membership_id;
    const branchId = hasOwn(input.body, "branchId")
      ? parseUuid(input.body.branchId, "branchId")
      : current.branch_id;
    const currentShiftDate = formatDateOnly(current.shift_date);
    if (!currentShiftDate) {
      throw new V0ShiftError(500, "shift instance has invalid date", "SHIFT_STATE_INVALID");
    }
    const shiftDate = hasOwn(input.body, "date")
      ? parseDate(input.body.date, "date")
      : currentShiftDate;
    const plannedStartTime = hasOwn(input.body, "plannedStartTime")
      ? parseTime(input.body.plannedStartTime, "plannedStartTime")
      : normalizeTime(current.planned_start_time);
    const plannedEndTime = hasOwn(input.body, "plannedEndTime")
      ? parseTime(input.body.plannedEndTime, "plannedEndTime")
      : normalizeTime(current.planned_end_time);
    const note = hasOwn(input.body, "note")
      ? parseOptionalString(input.body.note)
      : current.note;

    assertStartBeforeEnd(plannedStartTime, plannedEndTime);
    await this.assertPlanningTarget({
      tenantId: access.tenantId,
      membershipId,
      branchId,
    });

    try {
      const row = await this.repo.updateShiftInstance({
        instanceId,
        tenantId: access.tenantId,
        membershipId,
        branchId,
        shiftDate,
        plannedStartTime,
        plannedEndTime,
        note,
        actorAccountId: access.accountId,
      });
      if (!row) {
        throw new V0ShiftError(404, "shift instance not found", "SHIFT_INSTANCE_NOT_FOUND");
      }
      return mapInstance(row);
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async cancelInstance(input: {
    actor: ActorContext;
    instanceId: string;
    reason?: string | null;
  }) {
    const access = await this.assertWriteAccess(input.actor);
    const instanceId = parseUuid(input.instanceId, "instanceId");
    const reason = parseOptionalString(input.reason);
    const current = await this.repo.findShiftInstanceByIdInTenant({
      instanceId,
      tenantId: access.tenantId,
    });
    if (!current) {
      throw new V0ShiftError(404, "shift instance not found", "SHIFT_INSTANCE_NOT_FOUND");
    }
    if (current.status === "CANCELLED") {
      return mapInstance(current);
    }

    const row = await this.repo.cancelShiftInstance({
      instanceId,
      tenantId: access.tenantId,
      reason,
      actorAccountId: access.accountId,
    });
    if (!row) {
      throw new V0ShiftError(404, "shift instance not found", "SHIFT_INSTANCE_NOT_FOUND");
    }
    return mapInstance(row);
  }

  async listSchedule(input: {
    actor: ActorContext;
    branchId?: string;
    membershipId?: string;
    from?: string;
    to?: string;
    patternStatus?: string;
    instanceStatus?: string;
    limit?: number;
    offset?: number;
  }) {
    const access = await this.assertReadAccess(input.actor);
    const branchId = parseOptionalUuid(input.branchId, "branchId");
    const membershipId = parseOptionalUuid(input.membershipId, "membershipId");
    const from = parseOptionalDate(input.from, "from");
    const to = parseOptionalDate(input.to, "to");
    const patternStatus = parseOptionalPatternStatus(input.patternStatus);
    const instanceStatus = parseOptionalInstanceStatus(input.instanceStatus);
    const limit = normalizeLimit(input.limit);
    const offset = normalizeOffset(input.offset);

    if (branchId) {
      const branch = await this.repo.findBranchByIdInTenant({
        branchId,
        tenantId: access.tenantId,
      });
      if (!branch) {
        throw new V0ShiftError(422, "branch not found in tenant", "SHIFT_BRANCH_INVALID");
      }
    }
    if (membershipId) {
      const membership = await this.repo.findMembershipByIdInTenant({
        membershipId,
        tenantId: access.tenantId,
      });
      if (!membership) {
        throw new V0ShiftError(422, "membership not found in tenant", "SHIFT_MEMBERSHIP_INVALID");
      }
    }

    const [patterns, patternTotal, instances, instanceTotal] = await Promise.all([
      this.repo.listShiftPatterns({
        tenantId: access.tenantId,
        branchId,
        membershipId,
        fromDate: from,
        toDate: to,
        status: patternStatus,
        limit,
        offset,
      }),
      this.repo.countShiftPatterns({
        tenantId: access.tenantId,
        branchId,
        membershipId,
        fromDate: from,
        toDate: to,
        status: patternStatus,
      }),
      this.repo.listShiftInstances({
        tenantId: access.tenantId,
        branchId,
        membershipId,
        fromDate: from,
        toDate: to,
        status: instanceStatus,
        limit,
        offset,
      }),
      this.repo.countShiftInstances({
        tenantId: access.tenantId,
        branchId,
        membershipId,
        fromDate: from,
        toDate: to,
        status: instanceStatus,
      }),
    ]);

    return {
      patterns: buildOffsetPaginatedResult({
        items: patterns.map(mapPattern),
        limit,
        offset,
        total: patternTotal,
      }),
      instances: buildOffsetPaginatedResult({
        items: instances.map(mapInstance),
        limit,
        offset,
        total: instanceTotal,
      }),
    };
  }

  async listMembershipSchedule(input: {
    actor: ActorContext;
    membershipId: string;
    from?: string;
    to?: string;
    patternStatus?: string;
    instanceStatus?: string;
    limit?: number;
    offset?: number;
  }) {
    const access = await this.assertReadAccess(input.actor);
    const membershipId = parseUuid(input.membershipId, "membershipId");
    const from = parseOptionalDate(input.from, "from");
    const to = parseOptionalDate(input.to, "to");
    const patternStatus = parseOptionalPatternStatus(input.patternStatus);
    const instanceStatus = parseOptionalInstanceStatus(input.instanceStatus);
    const limit = normalizeLimit(input.limit);
    const offset = normalizeOffset(input.offset);

    const membership = await this.repo.findMembershipByIdInTenant({
      membershipId,
      tenantId: access.tenantId,
    });
    if (!membership) {
      throw new V0ShiftError(404, "membership not found", "SHIFT_MEMBERSHIP_INVALID");
    }

    const [patterns, patternTotal, instances, instanceTotal] = await Promise.all([
      this.repo.listShiftPatterns({
        tenantId: access.tenantId,
        branchId: null,
        membershipId,
        fromDate: from,
        toDate: to,
        status: patternStatus,
        limit,
        offset,
      }),
      this.repo.countShiftPatterns({
        tenantId: access.tenantId,
        branchId: null,
        membershipId,
        fromDate: from,
        toDate: to,
        status: patternStatus,
      }),
      this.repo.listShiftInstances({
        tenantId: access.tenantId,
        branchId: null,
        membershipId,
        fromDate: from,
        toDate: to,
        status: instanceStatus,
        limit,
        offset,
      }),
      this.repo.countShiftInstances({
        tenantId: access.tenantId,
        branchId: null,
        membershipId,
        fromDate: from,
        toDate: to,
        status: instanceStatus,
      }),
    ]);

    return {
      membershipId,
      patterns: buildOffsetPaginatedResult({
        items: patterns.map(mapPattern),
        limit,
        offset,
        total: patternTotal,
      }),
      instances: buildOffsetPaginatedResult({
        items: instances.map(mapInstance),
        limit,
        offset,
        total: instanceTotal,
      }),
    };
  }

  async listMySchedule(input: {
    actor: ActorContext;
  }) {
    const access = await this.assertSelfReadAccess(input.actor);
    const membershipId = access.requesterMembership.id;
    const today = currentDateOnly();

    const [patterns, instances] = await Promise.all([
      this.repo.listShiftPatterns({
        tenantId: access.tenantId,
        branchId: null,
        membershipId,
        fromDate: today,
        toDate: today,
        status: "ACTIVE",
        limit: 100,
        offset: 0,
      }),
      this.repo.listShiftInstances({
        tenantId: access.tenantId,
        branchId: null,
        membershipId,
        fromDate: today,
        toDate: null,
        status: null,
        limit: 100,
        offset: 0,
      }),
    ]);

    return {
      membershipId,
      patterns: patterns.map(mapPattern),
      instances: instances
        .filter((row) => row.status === "PLANNED" || row.status === "UPDATED")
        .map(mapInstance),
    };
  }

  async getInstance(input: { actor: ActorContext; instanceId: string }) {
    const access = await this.assertReadAccess(input.actor);
    const instanceId = parseUuid(input.instanceId, "instanceId");

    const row = await this.repo.findShiftInstanceByIdInTenant({
      instanceId,
      tenantId: access.tenantId,
    });
    if (!row) {
      throw new V0ShiftError(404, "shift instance not found", "SHIFT_INSTANCE_NOT_FOUND");
    }
    return mapInstance(row);
  }

  private async assertWriteAccess(actor: ActorContext): Promise<{
    accountId: string;
    tenantId: string;
    requesterMembership: V0TenantMembershipRow;
  }> {
    const scope = assertTenantContext(actor);
    const requesterMembership = await this.repo.findActiveMembershipForAccountInTenant({
      accountId: scope.accountId,
      tenantId: scope.tenantId,
    });
    if (!requesterMembership) {
      throw new V0ShiftError(403, "no membership", "NO_MEMBERSHIP");
    }
    if (!this.writeRoles.has(requesterMembership.role_key)) {
      throw new V0ShiftError(403, "no permission", "NO_PERMISSION");
    }
    return { ...scope, requesterMembership };
  }

  private async assertReadAccess(actor: ActorContext): Promise<{
    accountId: string;
    tenantId: string;
    requesterMembership: V0TenantMembershipRow;
  }> {
    const scope = assertTenantContext(actor);
    const requesterMembership = await this.repo.findActiveMembershipForAccountInTenant({
      accountId: scope.accountId,
      tenantId: scope.tenantId,
    });
    if (!requesterMembership) {
      throw new V0ShiftError(403, "no membership", "NO_MEMBERSHIP");
    }
    if (!this.readRoles.has(requesterMembership.role_key)) {
      throw new V0ShiftError(403, "no permission", "NO_PERMISSION");
    }
    return { ...scope, requesterMembership };
  }

  private async assertSelfReadAccess(actor: ActorContext): Promise<{
    accountId: string;
    tenantId: string;
    requesterMembership: V0TenantMembershipRow;
  }> {
    const scope = assertTenantContext(actor);
    const requesterMembership = await this.repo.findActiveMembershipForAccountInTenant({
      accountId: scope.accountId,
      tenantId: scope.tenantId,
    });
    if (!requesterMembership) {
      throw new V0ShiftError(403, "no membership", "NO_MEMBERSHIP");
    }
    return { ...scope, requesterMembership };
  }

  private async assertPlanningTarget(input: {
    tenantId: string;
    membershipId: string;
    branchId: string;
  }): Promise<void> {
    const membership = await this.repo.findMembershipByIdInTenant({
      membershipId: input.membershipId,
      tenantId: input.tenantId,
    });
    if (!membership || membership.status !== "ACTIVE") {
      throw new V0ShiftError(
        422,
        "membership must be active and in tenant",
        "SHIFT_MEMBERSHIP_INVALID"
      );
    }

    const branch = await this.repo.findActiveBranchByIdInTenant({
      branchId: input.branchId,
      tenantId: input.tenantId,
    });
    if (!branch) {
      throw new V0ShiftError(422, "branch must be active and in tenant", "SHIFT_BRANCH_INVALID");
    }

    const assigned = await this.repo.hasActiveBranchAssignmentForMembership({
      membershipId: input.membershipId,
      branchId: input.branchId,
    });
    if (!assigned) {
      throw new V0ShiftError(
        422,
        "membership is not assigned to the branch",
        "SHIFT_BRANCH_INVALID"
      );
    }
  }
}

function hasOwn(source: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function assertTenantContext(actor: ActorContext): { accountId: string; tenantId: string } {
  const accountId = String(actor.accountId ?? "").trim();
  const tenantId = String(actor.tenantId ?? "").trim();
  if (!accountId) {
    throw new V0ShiftError(401, "authentication required", "INVALID_ACCESS_TOKEN");
  }
  if (!tenantId) {
    throw new V0ShiftError(403, "tenant context required", "TENANT_CONTEXT_REQUIRED");
  }
  return { accountId, tenantId };
}

function parseUuid(value: unknown, fieldName: string): string {
  const normalized = String(value ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new V0ShiftError(422, `${fieldName} must be a valid UUID`, "SHIFT_PAYLOAD_INVALID");
  }
  return normalized;
}

function parseOptionalUuid(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null || String(value).trim().length === 0) {
    return null;
  }
  return parseUuid(value, fieldName);
}

function parseDaysOfWeek(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new V0ShiftError(422, "daysOfWeek must be a non-empty array", "SHIFT_PAYLOAD_INVALID");
  }
  const dedup = new Set<number>();
  for (const entry of value) {
    const n = Number(entry);
    if (!Number.isInteger(n) || n < 0 || n > 6) {
      throw new V0ShiftError(
        422,
        "daysOfWeek values must be integers in range 0..6",
        "SHIFT_PAYLOAD_INVALID"
      );
    }
    dedup.add(n);
  }
  return [...dedup].sort((a, b) => a - b);
}

function normalizeDaysOfWeek(value: unknown): number[] {
  if (Array.isArray(value)) {
    const numeric = value
      .map((entry) => Number(entry))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
    return [...new Set(numeric)].sort((a, b) => a - b);
  }
  return [];
}

function parseTime(value: unknown, fieldName: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new V0ShiftError(422, `${fieldName} is required`, "SHIFT_PAYLOAD_INVALID");
  }
  if (!/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/.test(normalized)) {
    throw new V0ShiftError(
      422,
      `${fieldName} must be in HH:mm format`,
      "SHIFT_TIME_RANGE_INVALID"
    );
  }
  return normalized.slice(0, 5);
}

function normalizeTime(value: unknown): string {
  return parseTime(String(value ?? ""), "time");
}

function parseDate(value: unknown, fieldName: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new V0ShiftError(422, `${fieldName} is required`, "SHIFT_PAYLOAD_INVALID");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new V0ShiftError(
      422,
      `${fieldName} must be in YYYY-MM-DD format`,
      "SHIFT_DATE_RANGE_INVALID"
    );
  }
  return normalized;
}

function parseOptionalDate(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null || String(value).trim().length === 0) {
    return null;
  }
  return parseDate(value, fieldName);
}

function parseOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function assertStartBeforeEnd(startTime: string, endTime: string): void {
  if (startTime >= endTime) {
    throw new V0ShiftError(
      422,
      "plannedStartTime must be earlier than plannedEndTime",
      "SHIFT_TIME_RANGE_INVALID"
    );
  }
}

function assertDateRange(from: string | null, to: string | null): void {
  if (!from || !to) {
    return;
  }
  if (from > to) {
    throw new V0ShiftError(422, "effectiveFrom must be <= effectiveTo", "SHIFT_DATE_RANGE_INVALID");
  }
}

function parseOptionalPatternStatus(value: unknown): V0ShiftPatternStatus | null {
  const normalized = parseOptionalString(value)?.toUpperCase();
  if (!normalized || normalized === "ALL") {
    return null;
  }
  if (normalized === "ACTIVE" || normalized === "INACTIVE") {
    return normalized;
  }
  throw new V0ShiftError(
    422,
    "patternStatus must be ACTIVE | INACTIVE | ALL",
    "SHIFT_PAYLOAD_INVALID"
  );
}

function parseOptionalInstanceStatus(value: unknown): V0ShiftInstanceStatus | null {
  const normalized = parseOptionalString(value)?.toUpperCase();
  if (!normalized || normalized === "ALL") {
    return null;
  }
  if (normalized === "PLANNED" || normalized === "UPDATED" || normalized === "CANCELLED") {
    return normalized;
  }
  throw new V0ShiftError(
    422,
    "instanceStatus must be PLANNED | UPDATED | CANCELLED | ALL",
    "SHIFT_PAYLOAD_INVALID"
  );
}

function normalizeLimit(value: unknown): number {
  const n = Number(value ?? 200);
  if (!Number.isFinite(n) || n <= 0) {
    return 200;
  }
  return Math.min(Math.floor(n), 500);
}

function normalizeOffset(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return Math.floor(n);
}

function formatDateOnly(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  if (value instanceof Date) {
    return [
      value.getFullYear().toString().padStart(4, "0"),
      (value.getMonth() + 1).toString().padStart(2, "0"),
      value.getDate().toString().padStart(2, "0"),
    ].join("-");
  }
  return String(value).slice(0, 10);
}

function currentDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatIsoDateTime(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date(value as string).toISOString();
}

function mapPattern(row: V0ShiftPatternRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    membershipId: row.membership_id,
    branchId: row.branch_id,
    daysOfWeek: normalizeDaysOfWeek(row.days_of_week),
    plannedStartTime: normalizeTime(row.planned_start_time),
    plannedEndTime: normalizeTime(row.planned_end_time),
    effectiveFrom: formatDateOnly(row.effective_from),
    effectiveTo: formatDateOnly(row.effective_to),
    status: row.status,
    note: row.note,
    deactivatedAt: row.deactivated_at ? formatIsoDateTime(row.deactivated_at) : null,
    createdAt: formatIsoDateTime(row.created_at),
    updatedAt: formatIsoDateTime(row.updated_at),
  };
}

function mapInstance(row: V0ShiftInstanceRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    membershipId: row.membership_id,
    branchId: row.branch_id,
    patternId: row.pattern_id,
    date: formatDateOnly(row.shift_date),
    plannedStartTime: normalizeTime(row.planned_start_time),
    plannedEndTime: normalizeTime(row.planned_end_time),
    status: row.status,
    note: row.note,
    cancelledReason: row.cancelled_reason,
    cancelledAt: row.cancelled_at ? formatIsoDateTime(row.cancelled_at) : null,
    createdAt: formatIsoDateTime(row.created_at),
    updatedAt: formatIsoDateTime(row.updated_at),
  };
}

function mapPersistenceError(error: unknown): Error {
  if (!error || typeof error !== "object") {
    return error as Error;
  }

  const pgError = error as PgError;
  if (pgError.code === "23505") {
    return new V0ShiftError(409, "shift overlap conflict", "SHIFT_OVERLAP_CONFLICT");
  }
  if (pgError.code === "23514") {
    return new V0ShiftError(
      422,
      "invalid shift time/date range",
      "SHIFT_TIME_RANGE_INVALID"
    );
  }
  return error as Error;
}
