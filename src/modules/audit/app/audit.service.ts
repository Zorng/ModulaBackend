import type {
  AuditDenialReason,
  AuditLogEntry,
  AuditOutcome,
} from "../domain/entities.js";
import { AuditRepository } from "../infra/repository.js";

export class AuditService {
  constructor(private repo: AuditRepository) {}

  async listLogs(params: {
    tenantId: string;
    from?: Date;
    to?: Date;
    branchId?: string;
    employeeId?: string;
    actionType?: string;
    outcome?: AuditOutcome;
    denialReason?: AuditDenialReason;
    page?: number;
    limit?: number;
  }): Promise<{ logs: AuditLogEntry[]; page: number; limit: number; total: number }> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 50;

    if (!Number.isInteger(page) || page < 1) {
      throw new Error("page must be a positive integer");
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("limit must be an integer between 1 and 100");
    }

    const { logs, total } = await this.repo.list({
      tenantId: params.tenantId,
      from: params.from,
      to: params.to,
      branchId: params.branchId,
      employeeId: params.employeeId,
      actionType: params.actionType,
      outcome: params.outcome,
      denialReason: params.denialReason,
      page,
      limit,
    });

    return { logs, page, limit, total };
  }

  async getLog(params: { tenantId: string; id: string }): Promise<AuditLogEntry> {
    const entry = await this.repo.getById(params);
    if (!entry) {
      throw new Error("Audit log not found");
    }
    return entry;
  }
}

