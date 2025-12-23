import type { Pool } from "pg";
import type { AuthMiddlewarePort } from "../../platform/security/auth.js";
import { ReportingService } from "./app/queries.js";
import { createReportingRouter } from "./api/router.js";
import { PgReportingRepository } from "./infra/queries.js";

export function bootstrapReportingModule(
  pool: Pool,
  authMiddleware: AuthMiddlewarePort
) {
  const repo = new PgReportingRepository(pool);
  const reportingService = new ReportingService(repo);
  const router = createReportingRouter(authMiddleware, reportingService);

  return { router };
}
