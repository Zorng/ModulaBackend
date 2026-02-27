import type { Pool } from "pg";
import { V0AuditService } from "../audit/app/service.js";
import { V0AuditRepository } from "../audit/infra/repository.js";
import { createV0ReportingRouter } from "./api/router.js";
import { V0ReportingService } from "./app/service.js";
import { V0ReportingRepository } from "./infra/repository.js";

export function bootstrapV0ReportingModule(pool: Pool) {
  const repo = new V0ReportingRepository(pool);
  const service = new V0ReportingService(repo);
  const auditService = new V0AuditService(new V0AuditRepository(pool));
  const router = createV0ReportingRouter({ service, auditService });
  return { repo, service, router };
}

export { V0ReportingRepository } from "./infra/repository.js";
export { V0ReportingService, V0ReportingError } from "./app/service.js";
export {
  V0_REPORTING_ACTION_KEYS,
  V0_REPORTING_AUDIT_EVENT_KEYS,
  buildReportViewedMetadata,
  type V0ReportingBranchScope,
  type V0ReportingRestockCostFilter,
  type V0ReportingSalesStatusFilter,
  type V0ReportingViewType,
  type V0ReportingWindow,
} from "./app/command-contract.js";
