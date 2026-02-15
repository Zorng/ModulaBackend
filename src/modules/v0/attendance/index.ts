import type { Pool } from "pg";
import { createV0AttendanceRouter } from "./api/router.js";
import { V0AttendanceService } from "./app/service.js";
import { V0AttendanceRepository } from "./infra/repository.js";

export function bootstrapV0AttendanceModule(pool: Pool) {
  const repo = new V0AttendanceRepository(pool);
  const service = new V0AttendanceService(repo);
  const router = createV0AttendanceRouter(service);
  return { router, service, repo };
}
