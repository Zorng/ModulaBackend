import {
  V0AttendanceRepository,
  type V0AttendanceScopedRecordRow,
  type V0BranchLocationVerificationSettingsRow,
} from "../infra/repository.js";
import {
  buildOffsetPaginatedResult,
  type OffsetPaginatedResult,
} from "../../../../../shared/pagination.js";

export class V0AttendanceError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "V0AttendanceError";
  }
}

type ActorContext = {
  accountId: string;
  tenantId: string | null;
  branchId: string | null;
};

type LocationVerificationStatus = "MATCH" | "MISMATCH" | "UNKNOWN";
type LocationVerificationMode = "disabled" | "checkin_only" | "checkin_and_checkout";

type ParsedObservedLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  capturedAt: Date;
};

type LocationEvaluation = {
  status: LocationVerificationStatus | null;
  reason: string | null;
  distanceMeters: number | null;
};

export class V0AttendanceService {
  constructor(private readonly repo: V0AttendanceRepository) {}

  async checkIn(input: {
    actor: ActorContext;
    occurredAt?: string;
    location?: unknown;
  }) {
    const scope = assertBranchContext(input.actor);
    const occurredAt = parseOccurredAt(input.occurredAt);
    const observedLocation = parseObservedLocation(input.location);

    const latest = await this.repo.findLatestRecord({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      accountId: scope.accountId,
    });
    if (latest?.type === "CHECK_IN") {
      throw new V0AttendanceError(409, "already checked in");
    }

    const locationSettings = await this.repo.getBranchLocationVerificationSettings({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
    });
    if (!locationSettings) {
      throw new V0AttendanceError(404, "branch not found");
    }
    const locationEvaluation = evaluateLocation({
      mode: locationSettings.attendance_location_verification_mode,
      shouldVerify:
        locationSettings.attendance_location_verification_mode === "checkin_only" ||
        locationSettings.attendance_location_verification_mode === "checkin_and_checkout",
      observedLocation,
      locationSettings,
    });

    const created = await this.repo.createRecord({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      accountId: scope.accountId,
      type: "CHECK_IN",
      occurredAt,
      observedLatitude: observedLocation?.latitude ?? null,
      observedLongitude: observedLocation?.longitude ?? null,
      observedAccuracyMeters: observedLocation?.accuracyMeters ?? null,
      locationCapturedAt: observedLocation?.capturedAt ?? null,
      locationVerificationStatus: locationEvaluation.status,
      locationVerificationReason: locationEvaluation.reason,
      locationDistanceMeters: locationEvaluation.distanceMeters,
      forceEndedByAccountId: null,
      forceEndReason: null,
    });
    return mapRecord(created);
  }

  async checkOut(input: {
    actor: ActorContext;
    occurredAt?: string;
    location?: unknown;
  }) {
    const scope = assertBranchContext(input.actor);
    const occurredAt = parseOccurredAt(input.occurredAt);
    const observedLocation = parseObservedLocation(input.location);

    const latest = await this.repo.findLatestRecord({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      accountId: scope.accountId,
    });
    if (!latest || latest.type !== "CHECK_IN") {
      throw new V0AttendanceError(409, "no active check-in");
    }

    const locationSettings = await this.repo.getBranchLocationVerificationSettings({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
    });
    if (!locationSettings) {
      throw new V0AttendanceError(404, "branch not found");
    }
    const locationEvaluation = evaluateLocation({
      mode: locationSettings.attendance_location_verification_mode,
      shouldVerify:
        locationSettings.attendance_location_verification_mode === "checkin_and_checkout",
      observedLocation,
      locationSettings,
    });

    const created = await this.repo.createRecord({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      accountId: scope.accountId,
      type: "CHECK_OUT",
      occurredAt,
      observedLatitude: observedLocation?.latitude ?? null,
      observedLongitude: observedLocation?.longitude ?? null,
      observedAccuracyMeters: observedLocation?.accuracyMeters ?? null,
      locationCapturedAt: observedLocation?.capturedAt ?? null,
      locationVerificationStatus: locationEvaluation.status,
      locationVerificationReason: locationEvaluation.reason,
      locationDistanceMeters: locationEvaluation.distanceMeters,
      forceEndedByAccountId: null,
      forceEndReason: null,
    });
    return mapRecord(created);
  }

  async listMine(input: {
    actor: ActorContext;
    limit?: number;
    offset?: number;
  }): Promise<OffsetPaginatedResult<Record<string, unknown>>> {
    const scope = assertBranchContext(input.actor);
    const limit = normalizeLimit(input.limit);
    const offset = normalizeOffset(input.offset);

    const [rows, total] = await Promise.all([
      this.repo.listRecordsForActor({
        tenantId: scope.tenantId,
        branchId: scope.branchId,
        accountId: scope.accountId,
        limit,
        offset,
      }),
      this.repo.countRecordsForActor({
        tenantId: scope.tenantId,
        branchId: scope.branchId,
        accountId: scope.accountId,
      }),
    ]);
    return buildOffsetPaginatedResult({
      items: rows.map(mapRecord),
      limit,
      offset,
      total,
    });
  }

  async forceEndWork(input: {
    actor: ActorContext;
    targetAccountId: unknown;
    reason: unknown;
    occurredAt?: string;
    location?: unknown;
  }) {
    const scope = assertBranchContext(input.actor);
    const targetAccountId = parseRequiredUuid(input.targetAccountId, "targetAccountId");
    const reason = parseRequiredReason(input.reason, "reason");
    const occurredAt = parseOccurredAt(input.occurredAt);
    const observedLocation = parseObservedLocation(input.location);

    const latest = await this.repo.findLatestRecord({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      accountId: targetAccountId,
    });
    if (!latest || latest.type !== "CHECK_IN") {
      throw new V0AttendanceError(409, "target has no active check-in");
    }

    const locationSettings = await this.repo.getBranchLocationVerificationSettings({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
    });
    if (!locationSettings) {
      throw new V0AttendanceError(404, "branch not found");
    }
    const locationEvaluation = evaluateLocation({
      mode: locationSettings.attendance_location_verification_mode,
      shouldVerify:
        locationSettings.attendance_location_verification_mode === "checkin_and_checkout",
      observedLocation,
      locationSettings,
    });

    const created = await this.repo.createRecord({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      accountId: targetAccountId,
      type: "CHECK_OUT",
      occurredAt,
      observedLatitude: observedLocation?.latitude ?? null,
      observedLongitude: observedLocation?.longitude ?? null,
      observedAccuracyMeters: observedLocation?.accuracyMeters ?? null,
      locationCapturedAt: observedLocation?.capturedAt ?? null,
      locationVerificationStatus: locationEvaluation.status,
      locationVerificationReason: locationEvaluation.reason,
      locationDistanceMeters: locationEvaluation.distanceMeters,
      forceEndedByAccountId: scope.accountId,
      forceEndReason: reason,
    });
    return mapRecord(created);
  }

  async listBranch(input: {
    actor: ActorContext;
    accountId?: unknown;
    occurredFrom?: unknown;
    occurredTo?: unknown;
    limit?: number;
    offset?: number;
  }): Promise<OffsetPaginatedResult<Record<string, unknown>>> {
    const scope = assertBranchContext(input.actor);
    const accountId = parseOptionalUuid(input.accountId, "accountId");
    const occurredFrom = parseOptionalOccurredAt(input.occurredFrom, "occurredFrom");
    const occurredTo = parseOptionalOccurredAt(input.occurredTo, "occurredTo");
    assertOccurredRange(occurredFrom, occurredTo);
    const limit = normalizeLimit(input.limit);
    const offset = normalizeOffset(input.offset);

    const [rows, total] = await Promise.all([
      this.repo.listRecordsForBranch({
        tenantId: scope.tenantId,
        branchId: scope.branchId,
        accountId,
        occurredFrom,
        occurredTo,
        limit,
        offset,
      }),
      this.repo.countRecordsForBranch({
        tenantId: scope.tenantId,
        branchId: scope.branchId,
        accountId,
        occurredFrom,
        occurredTo,
      }),
    ]);
    return buildOffsetPaginatedResult({
      items: rows.map(mapScopedRecord),
      limit,
      offset,
      total,
    });
  }

  async listTenant(input: {
    actor: ActorContext;
    branchId?: unknown;
    accountId?: unknown;
    occurredFrom?: unknown;
    occurredTo?: unknown;
    limit?: number;
    offset?: number;
  }): Promise<OffsetPaginatedResult<Record<string, unknown>>> {
    const scope = assertTenantContext(input.actor);
    const branchId = parseOptionalUuid(input.branchId, "branchId");
    const accountId = parseOptionalUuid(input.accountId, "accountId");
    const occurredFrom = parseOptionalOccurredAt(input.occurredFrom, "occurredFrom");
    const occurredTo = parseOptionalOccurredAt(input.occurredTo, "occurredTo");
    assertOccurredRange(occurredFrom, occurredTo);
    const limit = normalizeLimit(input.limit);
    const offset = normalizeOffset(input.offset);

    const [rows, total] = await Promise.all([
      this.repo.listRecordsForTenant({
        tenantId: scope.tenantId,
        branchId,
        accountId,
        occurredFrom,
        occurredTo,
        limit,
        offset,
      }),
      this.repo.countRecordsForTenant({
        tenantId: scope.tenantId,
        branchId,
        accountId,
        occurredFrom,
        occurredTo,
      }),
    ]);
    return buildOffsetPaginatedResult({
      items: rows.map(mapScopedRecord),
      limit,
      offset,
      total,
    });
  }
}

function assertBranchContext(actor: ActorContext): {
  accountId: string;
  tenantId: string;
  branchId: string;
} {
  const accountId = String(actor.accountId ?? "").trim();
  const tenantId = String(actor.tenantId ?? "").trim();
  const branchId = String(actor.branchId ?? "").trim();

  if (!accountId) {
    throw new V0AttendanceError(401, "authentication required");
  }
  if (!tenantId) {
    throw new V0AttendanceError(403, "tenant context required");
  }
  if (!branchId) {
    throw new V0AttendanceError(403, "branch context required");
  }

  return { accountId, tenantId, branchId };
}

function assertTenantContext(actor: ActorContext): {
  accountId: string;
  tenantId: string;
} {
  const accountId = String(actor.accountId ?? "").trim();
  const tenantId = String(actor.tenantId ?? "").trim();

  if (!accountId) {
    throw new V0AttendanceError(401, "authentication required");
  }
  if (!tenantId) {
    throw new V0AttendanceError(403, "tenant context required");
  }

  return { accountId, tenantId };
}

function parseOccurredAt(input?: string): Date {
  if (!input) {
    return new Date();
  }
  const value = new Date(input);
  if (Number.isNaN(value.getTime())) {
    throw new V0AttendanceError(422, "occurredAt must be a valid ISO timestamp");
  }
  return value;
}

function parseOptionalOccurredAt(input: unknown, field: string): Date | null {
  if (input === null || input === undefined || input === "") {
    return null;
  }
  const value = new Date(String(input));
  if (Number.isNaN(value.getTime())) {
    throw new V0AttendanceError(422, `${field} must be a valid ISO timestamp`);
  }
  return value;
}

function assertOccurredRange(occurredFrom: Date | null, occurredTo: Date | null): void {
  if (occurredFrom && occurredTo && occurredFrom.getTime() > occurredTo.getTime()) {
    throw new V0AttendanceError(422, "occurredFrom must be <= occurredTo");
  }
}

function parseObservedLocation(input: unknown): ParsedObservedLocation | null {
  if (input === null || input === undefined) {
    return null;
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new V0AttendanceError(422, "location must be an object");
  }
  const body = input as Record<string, unknown>;
  const latitude = parseCoordinate(body.latitude, "location.latitude", -90, 90);
  const longitude = parseCoordinate(body.longitude, "location.longitude", -180, 180);
  const accuracyMeters = parseOptionalNonNegativeNumber(
    body.accuracyMeters,
    "location.accuracyMeters"
  );
  const capturedAt = parseOptionalIsoDate(body.capturedAt, "location.capturedAt") ?? new Date();
  return {
    latitude,
    longitude,
    accuracyMeters,
    capturedAt,
  };
}

function parseCoordinate(
  value: unknown,
  field: string,
  min: number,
  max: number
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new V0AttendanceError(422, `${field} must be a number`);
  }
  if (parsed < min || parsed > max) {
    throw new V0AttendanceError(422, `${field} must be in range [${min}, ${max}]`);
  }
  return parsed;
}

function parseOptionalNonNegativeNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new V0AttendanceError(422, `${field} must be a number`);
  }
  if (parsed < 0) {
    throw new V0AttendanceError(422, `${field} must be >= 0`);
  }
  return parsed;
}

function parseOptionalIsoDate(value: unknown, field: string): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const normalized = String(value).trim();
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new V0AttendanceError(422, `${field} must be a valid ISO timestamp`);
  }
  return parsed;
}

function parseRequiredReason(value: unknown, field: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new V0AttendanceError(422, `${field} is required`);
  }
  if (normalized.length > 500) {
    throw new V0AttendanceError(422, `${field} must be <= 500 characters`);
  }
  return normalized;
}

function parseRequiredUuid(value: unknown, field: string): string {
  const normalized = String(value ?? "").trim();
  if (!UUID_REGEX.test(normalized)) {
    throw new V0AttendanceError(422, `${field} must be a valid UUID`);
  }
  return normalized;
}

function parseOptionalUuid(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const normalized = String(value).trim();
  if (!UUID_REGEX.test(normalized)) {
    throw new V0AttendanceError(422, `${field} must be a valid UUID`);
  }
  return normalized;
}

function evaluateLocation(input: {
  mode: LocationVerificationMode;
  shouldVerify: boolean;
  observedLocation: ParsedObservedLocation | null;
  locationSettings: V0BranchLocationVerificationSettingsRow;
}): LocationEvaluation {
  if (input.mode === "disabled" || !input.shouldVerify) {
    return {
      status: null,
      reason: null,
      distanceMeters: null,
    };
  }

  if (!input.observedLocation) {
    return {
      status: "UNKNOWN",
      reason: "LOCATION_NOT_PROVIDED",
      distanceMeters: null,
    };
  }

  if (
    input.locationSettings.workplace_latitude === null ||
    input.locationSettings.workplace_longitude === null ||
    input.locationSettings.workplace_radius_meters === null
  ) {
    return {
      status: "UNKNOWN",
      reason: "WORKPLACE_NOT_CONFIGURED",
      distanceMeters: null,
    };
  }

  if (
    input.observedLocation.accuracyMeters !== null &&
    input.observedLocation.accuracyMeters > 100
  ) {
    return {
      status: "UNKNOWN",
      reason: "LOW_GPS_CONFIDENCE",
      distanceMeters: null,
    };
  }

  const distanceMeters = haversineDistanceMeters({
    fromLatitude: input.observedLocation.latitude,
    fromLongitude: input.observedLocation.longitude,
    toLatitude: input.locationSettings.workplace_latitude,
    toLongitude: input.locationSettings.workplace_longitude,
  });
  const radiusMeters = input.locationSettings.workplace_radius_meters;
  const status: LocationVerificationStatus =
    distanceMeters <= radiusMeters ? "MATCH" : "MISMATCH";

  return {
    status,
    reason: status === "MISMATCH" ? "OUTSIDE_WORKPLACE_RADIUS" : null,
    distanceMeters,
  };
}

function haversineDistanceMeters(input: {
  fromLatitude: number;
  fromLongitude: number;
  toLatitude: number;
  toLongitude: number;
}): number {
  const earthRadiusMeters = 6_371_000;
  const dLat = toRadians(input.toLatitude - input.fromLatitude);
  const dLon = toRadians(input.toLongitude - input.fromLongitude);
  const fromLat = toRadians(input.fromLatitude);
  const toLat = toRadians(input.toLatitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(fromLat) * Math.cos(toLat);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((earthRadiusMeters * c).toFixed(2));
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function normalizeLimit(input: number | undefined): number {
  const n = Number(input ?? 50);
  if (!Number.isFinite(n) || n <= 0) {
    return 50;
  }
  return Math.min(Math.floor(n), 200);
}

function normalizeOffset(input: number | undefined): number {
  const n = Number(input ?? 0);
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return Math.min(Math.floor(n), 10_000);
}

function mapRecord(row: {
  id: string;
  tenant_id: string;
  branch_id: string;
  account_id: string;
  type: "CHECK_IN" | "CHECK_OUT";
  occurred_at: Date;
  created_at: Date;
  observed_latitude: number | null;
  observed_longitude: number | null;
  observed_accuracy_meters: number | null;
  location_captured_at: Date | null;
  location_verification_status: "MATCH" | "MISMATCH" | "UNKNOWN" | null;
  location_verification_reason: string | null;
  location_distance_meters: number | null;
  force_ended_by_account_id: string | null;
  force_end_reason: string | null;
}) {
  const hasLocationEvidence =
    row.location_verification_status !== null ||
    row.observed_latitude !== null ||
    row.observed_longitude !== null ||
    row.observed_accuracy_meters !== null ||
    row.location_captured_at !== null;

  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    accountId: row.account_id,
    type: row.type,
    occurredAt: row.occurred_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    locationVerification: hasLocationEvidence
      ? {
          observedLatitude: row.observed_latitude,
          observedLongitude: row.observed_longitude,
          observedAccuracyMeters: row.observed_accuracy_meters,
          capturedAt: row.location_captured_at?.toISOString() ?? null,
          status: row.location_verification_status,
          reason: row.location_verification_reason,
          distanceMeters: row.location_distance_meters,
        }
      : null,
    forceEndedByAccountId: row.force_ended_by_account_id,
    forceEndReason: row.force_end_reason,
  };
}

function mapScopedRecord(row: V0AttendanceScopedRecordRow) {
  return {
    ...mapRecord(row),
    account: {
      id: row.account_id,
      phone: row.account_phone,
      firstName: row.account_first_name,
      lastName: row.account_last_name,
    },
    branch: {
      id: row.branch_id,
      name: row.branch_name,
    },
  };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
