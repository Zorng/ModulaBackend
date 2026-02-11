import { Ok, Err, type Result } from "../../../shared/result.js";
import type { BranchGuardPort } from "../../../shared/ports/branch.js";
import type {
  AttendanceRecord,
  AttendanceRequest,
  AttendanceRecordType,
  AttendanceRequestStatus,
  AttendanceRequestType,
  AttendanceLocation,
} from "../domain/entities.js";
import type { AttendanceRepository } from "../infra/repository.js";
import type { AttendanceShiftRepository, ShiftScheduleEntry } from "../infra/shift.repository.js";

export type AttendanceRole = "CASHIER" | "MANAGER" | "ADMIN";
export type AttendanceShiftStatus = "IN_SHIFT" | "EARLY" | "OUT_OF_SHIFT";

export interface AttendancePolicySnapshot {
  autoFromCashSession: boolean;
  requireOutOfShiftApproval: boolean;
  earlyCheckinBufferEnabled: boolean;
  checkinBufferMinutes: number;
  allowManagerEdits: boolean;
}

export interface AttendancePolicyPort {
  getAttendancePolicies(params: {
    tenantId: string;
    branchId: string;
  }): Promise<AttendancePolicySnapshot | null>;
}

export interface CheckInInput {
  tenantId: string;
  branchId: string;
  employeeId: string;
  occurredAt?: Date;
  location?: AttendanceLocation;
  shiftStatus?: AttendanceShiftStatus;
  earlyMinutes?: number;
  note?: string | null;
}

export type CheckInResult =
  | { status: "CHECKED_IN"; record: AttendanceRecord }
  | { status: "PENDING_APPROVAL"; request: AttendanceRequest };

export interface CheckOutInput {
  tenantId: string;
  branchId: string;
  employeeId: string;
  occurredAt?: Date;
  location?: AttendanceLocation;
}

export interface ListAttendanceInput {
  tenantId: string;
  role: AttendanceRole;
  requesterEmployeeId: string;
  branchId?: string;
  employeeId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface ResolveRequestInput {
  tenantId: string;
  branchId: string;
  requestId: string;
  actorId: string;
  actorRole: AttendanceRole;
  note?: string | null;
}

export class CheckInUseCase {
  constructor(
    private repo: AttendanceRepository,
    private policyPort: AttendancePolicyPort,
    private branchGuard: BranchGuardPort
  ) {}

  async execute(input: CheckInInput): Promise<Result<CheckInResult, string>> {
    try {
      await this.branchGuard.assertBranchActive({
        tenantId: input.tenantId,
        branchId: input.branchId,
      });

      const latest = await this.repo.findLatestRecord({
        tenantId: input.tenantId,
        branchId: input.branchId,
        employeeId: input.employeeId,
      });
      if (latest && latest.type === "CHECK_IN") {
        return Err("Already checked in");
      }

      const policies = await this.policyPort.getAttendancePolicies({
        tenantId: input.tenantId,
        branchId: input.branchId,
      });
      const effectivePolicies =
        policies ?? {
          autoFromCashSession: false,
          requireOutOfShiftApproval: false,
          earlyCheckinBufferEnabled: false,
          checkinBufferMinutes: 15,
          allowManagerEdits: false,
        };

      const shiftStatus = input.shiftStatus ?? "IN_SHIFT";
      let requiresApproval = false;

      if (shiftStatus === "OUT_OF_SHIFT") {
        requiresApproval = effectivePolicies.requireOutOfShiftApproval;
      } else if (shiftStatus === "EARLY") {
        const earlyMinutes = input.earlyMinutes ?? Number.POSITIVE_INFINITY;
        if (
          effectivePolicies.earlyCheckinBufferEnabled &&
          earlyMinutes <= effectivePolicies.checkinBufferMinutes
        ) {
          requiresApproval = false;
        } else {
          requiresApproval = effectivePolicies.requireOutOfShiftApproval;
        }
      }

      if (requiresApproval) {
        const request = await this.repo.createRequest({
          tenantId: input.tenantId,
          branchId: input.branchId,
          employeeId: input.employeeId,
          requestType: "CHECK_IN",
          requestedCheckInAt: input.occurredAt ?? new Date(),
          note: input.note ?? null,
        });
        return Ok({ status: "PENDING_APPROVAL", request });
      }

      const record = await this.repo.createRecord({
        tenantId: input.tenantId,
        branchId: input.branchId,
        employeeId: input.employeeId,
        type: "CHECK_IN",
        occurredAt: input.occurredAt,
        location: input.location,
      });
      return Ok({ status: "CHECKED_IN", record });
    } catch (error) {
      return Err(error instanceof Error ? error.message : "Failed to check in");
    }
  }
}

export class CheckOutUseCase {
  constructor(private repo: AttendanceRepository) {}

  async execute(input: CheckOutInput): Promise<Result<AttendanceRecord, string>> {
    try {
      const latest = await this.repo.findLatestRecord({
        tenantId: input.tenantId,
        branchId: input.branchId,
        employeeId: input.employeeId,
      });
      if (!latest || latest.type !== "CHECK_IN") {
        return Err("No active check-in");
      }

      const record = await this.repo.createRecord({
        tenantId: input.tenantId,
        branchId: input.branchId,
        employeeId: input.employeeId,
        type: "CHECK_OUT",
        occurredAt: input.occurredAt,
        location: input.location,
      });
      return Ok(record);
    } catch (error) {
      return Err(error instanceof Error ? error.message : "Failed to check out");
    }
  }
}

export class ListAttendanceUseCase {
  constructor(private repo: AttendanceRepository) {}

  async execute(input: ListAttendanceInput): Promise<Result<AttendanceRecord[], string>> {
    try {
      const role = input.role;
      let branchId = input.branchId;
      let employeeId = input.employeeId;

      if (role !== "CASHIER" && role !== "MANAGER" && role !== "ADMIN") {
        return Err("Invalid role");
      }

      if (role === "CASHIER") {
        if (!branchId) {
          return Err("branchId is required");
        }
        employeeId = input.requesterEmployeeId;
      } else if (role === "MANAGER") {
        if (!branchId) {
          return Err("branchId is required");
        }
      }

      const records = await this.repo.listRecords({
        tenantId: input.tenantId,
        branchId,
        employeeId,
        from: input.from,
        to: input.to,
        limit: input.limit,
        offset: input.offset,
      });

      return Ok(records);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to list attendance"
      );
    }
  }
}

export class ApproveOutOfShiftRequestUseCase {
  constructor(
    private repo: AttendanceRepository,
    private branchGuard: BranchGuardPort
  ) {}

  async execute(
    input: ResolveRequestInput
  ): Promise<Result<AttendanceRequest, string>> {
    return resolveOutOfShiftRequest({
      repo: this.repo,
      branchGuard: this.branchGuard,
      input,
      status: "APPROVED",
    });
  }
}

export class RejectOutOfShiftRequestUseCase {
  constructor(
    private repo: AttendanceRepository,
    private branchGuard: BranchGuardPort
  ) {}

  async execute(
    input: ResolveRequestInput
  ): Promise<Result<AttendanceRequest, string>> {
    return resolveOutOfShiftRequest({
      repo: this.repo,
      branchGuard: this.branchGuard,
      input,
      status: "REJECTED",
    });
  }
}

export class ListMyShiftScheduleUseCase {
  constructor(private repo: AttendanceShiftRepository) {}

  async execute(params: {
    tenantId: string;
    employeeId: string;
    branchId: string;
  }): Promise<Result<ShiftScheduleEntry[], string>> {
    try {
      const schedule = await this.repo.listShiftSchedule(params);
      return Ok(schedule);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to list shift schedule"
      );
    }
  }
}

async function resolveOutOfShiftRequest(params: {
  repo: AttendanceRepository;
  branchGuard: BranchGuardPort;
  input: ResolveRequestInput;
  status: Exclude<AttendanceRequestStatus, "PENDING">;
}): Promise<Result<AttendanceRequest, string>> {
  try {
    if (
      params.input.actorRole !== "ADMIN" &&
      params.input.actorRole !== "MANAGER"
    ) {
      return Err("Insufficient permissions");
    }

    const request = await params.repo.getRequestById({
      tenantId: params.input.tenantId,
      requestId: params.input.requestId,
    });
    if (!request) {
      return Err("Request not found");
    }
    if (request.status !== "PENDING") {
      return Err("Request already resolved");
    }
    if (
      params.input.actorRole === "MANAGER" &&
      request.branchId !== params.input.branchId
    ) {
      return Err("Branch access denied");
    }

    await params.branchGuard.assertBranchActive({
      tenantId: params.input.tenantId,
      branchId: request.branchId,
    });

    const attendanceRecordId =
      params.status === "APPROVED"
        ? (
            await params.repo.createRecord({
              tenantId: request.tenantId,
              branchId: request.branchId,
              employeeId: request.employeeId,
              type: "CHECK_IN",
              occurredAt: request.requestedCheckInAt,
            })
          ).id
        : null;

    const resolved = await params.repo.resolveRequest({
      tenantId: params.input.tenantId,
      requestId: params.input.requestId,
      status: params.status,
      resolvedBy: params.input.actorId,
      attendanceRecordId,
    });

    if (!resolved) {
      return Err("Failed to resolve request");
    }

    return Ok(resolved);
  } catch (error) {
    return Err(
      error instanceof Error ? error.message : "Failed to resolve request"
    );
  }
}
