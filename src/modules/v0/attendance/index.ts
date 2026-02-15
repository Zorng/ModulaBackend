import type { Pool } from "pg";
import { createV0AttendanceRouter } from "./api/router.js";
import { V0AttendanceService } from "./app/service.js";
import { V0AttendanceRepository } from "./infra/repository.js";
import { V0IdempotencyRepository } from "../../../platform/idempotency/repository.js";
import { V0IdempotencyService } from "../../../platform/idempotency/service.js";
import { V0AuditRepository } from "../audit/infra/repository.js";
import { V0AuditService } from "../audit/app/service.js";

export function bootstrapV0AttendanceModule(pool: Pool) {
  const repo = new V0AttendanceRepository(pool);
  const service = new V0AttendanceService(repo);
  const idempotencyRepo = new V0IdempotencyRepository(pool);
  const idempotencyService = new V0IdempotencyService(idempotencyRepo);
  const auditRepo = new V0AuditRepository(pool);
  const auditService = new V0AuditService(auditRepo);
  const router = createV0AttendanceRouter(service, idempotencyService, auditService);
  return { router, service, repo };
}
