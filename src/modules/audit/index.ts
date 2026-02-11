import type { Pool } from "pg";
import type { AuthMiddlewarePort } from "../../platform/security/auth.js";
import type { AuditQueryPort, AuditWriterPort } from "../../shared/ports/audit.js";
import { AuditService } from "./app/audit.service.js";
import { createAuditRouter } from "./api/router.js";
import { AuditRepository } from "./infra/repository.js";

export function bootstrapAuditModule(pool: Pool) {
  const repo = new AuditRepository(pool);
  const service = new AuditService(repo);

  const auditWriterPort: AuditWriterPort = {
    write: async (entry, client) => repo.write(entry, client),
  };

  const auditQueryPort: AuditQueryPort = {
    list: async (params) =>
      service.listLogs({
        tenantId: params.tenantId,
        from: params.from,
        to: params.to,
        branchId: params.branchId,
        employeeId: params.employeeId,
        actionType: params.actionType,
        outcome: params.outcome,
        denialReason: params.denialReason,
        page: params.page,
        limit: params.limit,
      }),
    getById: async (params) => {
      try {
        return await repo.getById(params);
      } catch {
        return null;
      }
    },
  };

  return {
    service,
    auditWriterPort,
    auditQueryPort,
    createRouter: (auth: AuthMiddlewarePort) => createAuditRouter(service, auth),
  };
}
