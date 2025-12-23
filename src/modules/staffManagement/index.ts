import type { Pool } from "pg";
import type { AuthMiddlewarePort } from "../../platform/security/auth.js";
import { config } from "../../platform/config/index.js";
import type { AuditWriterPort } from "../../shared/ports/audit.js";
import {
  StaffManagementService,
  createInvitationPort,
} from "./app/staffManagement.service.js";
import { StaffManagementRepository } from "./infra/repository.js";
import { StaffManagementController } from "./api/controllers/staffManagement.controller.js";
import { createStaffManagementRoutes } from "./api/routes/staffManagement.routes.js";

export function bootstrapStaffManagementModule(
  pool: Pool,
  deps: { auditWriterPort: AuditWriterPort }
) {
  const repo = new StaffManagementRepository(pool);
  const service = new StaffManagementService(
    repo,
    deps.auditWriterPort,
    config.auth.defaultInviteExpiryHours
  );
  const controller = new StaffManagementController(service);

  const invitationPort = createInvitationPort(repo, deps.auditWriterPort);

  return {
    invitationPort,
    createRouter: (authMiddleware: AuthMiddlewarePort) =>
      createStaffManagementRoutes(controller, authMiddleware),
  };
}
