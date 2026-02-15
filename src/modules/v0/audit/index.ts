import type { Pool } from "pg";
import { createV0AuditRouter } from "./api/router.js";
import { V0AuditService } from "./app/service.js";
import { V0AuditRepository } from "./infra/repository.js";

export function bootstrapV0AuditModule(pool: Pool) {
  const repo = new V0AuditRepository(pool);
  const service = new V0AuditService(repo);
  const router = createV0AuditRouter(service);
  return { repo, service, router };
}
