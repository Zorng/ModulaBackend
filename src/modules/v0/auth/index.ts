import type { Pool } from "pg";
import { createV0AuthRouter } from "./api/router.js";
import { V0AuthService } from "./app/service.js";
import { V0AuthRepository } from "./infra/repository.js";
import { V0AuditRepository } from "../audit/infra/repository.js";
import { V0AuditService } from "../audit/app/service.js";

export function bootstrapV0AuthModule(pool: Pool) {
  const repo = new V0AuthRepository(pool);
  const service = new V0AuthService(repo);
  const auditRepo = new V0AuditRepository(pool);
  const auditService = new V0AuditService(auditRepo);
  const router = createV0AuthRouter(service, auditService);
  return { router, service, repo };
}
