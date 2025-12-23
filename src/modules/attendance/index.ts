import type { Pool } from "pg";
import type { AuthMiddlewarePort } from "../../platform/security/auth.js";
import type { BranchGuardPort } from "../../shared/ports/branch.js";
import { createAttendanceRouter } from "./api/router.js";
import {
  CheckInUseCase,
  CheckOutUseCase,
  ListAttendanceUseCase,
  ApproveOutOfShiftRequestUseCase,
  RejectOutOfShiftRequestUseCase,
  ListMyShiftScheduleUseCase,
} from "./app/use-cases.js";
import { PgAttendanceRepository } from "./infra/repository.js";
import { AttendancePolicyAdapter } from "./infra/policy.adapter.js";
import { AttendanceShiftRepository } from "./infra/shift.repository.js";

export function bootstrapAttendanceModule(
  pool: Pool,
  authMiddleware: AuthMiddlewarePort,
  deps: { branchGuardPort: BranchGuardPort }
) {
  const repo = new PgAttendanceRepository(pool);
  const shiftRepo = new AttendanceShiftRepository(pool);
  const policyPort = new AttendancePolicyAdapter(pool);

  const checkInUseCase = new CheckInUseCase(
    repo,
    policyPort,
    deps.branchGuardPort
  );
  const checkOutUseCase = new CheckOutUseCase(repo);
  const listAttendanceUseCase = new ListAttendanceUseCase(repo);
  const listMyShiftScheduleUseCase = new ListMyShiftScheduleUseCase(shiftRepo);
  const approveRequestUseCase = new ApproveOutOfShiftRequestUseCase(
    repo,
    deps.branchGuardPort
  );
  const rejectRequestUseCase = new RejectOutOfShiftRequestUseCase(
    repo,
    deps.branchGuardPort
  );

  const router = createAttendanceRouter(authMiddleware, {
    checkInUseCase,
    checkOutUseCase,
    listAttendanceUseCase,
    approveRequestUseCase,
    rejectRequestUseCase,
    listMyShiftScheduleUseCase,
  });

  return { router };
}
