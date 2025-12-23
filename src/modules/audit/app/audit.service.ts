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

  async ingestOfflineEvents(params: {
    tenantId: string;
    branchId: string;
    employeeId: string;
    actorRole: string;
    ipAddress?: string;
    userAgent?: string;
    events: Array<{
      clientEventId: string;
      occurredAt: Date;
      actionType: string;
      resourceType?: string;
      resourceId?: string;
      outcome?: AuditOutcome;
      denialReason?: AuditDenialReason;
      details?: Record<string, any>;
    }>;
  }): Promise<{ ingested: number; deduped: number }> {
    if (!Array.isArray(params.events) || params.events.length === 0) {
      throw new Error("events must be a non-empty array");
    }

    if (params.events.length > 100) {
      throw new Error("events cannot exceed 100 per request");
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    const seen = new Set<string>();
    let ingested = 0;
    let deduped = 0;

    for (const event of params.events) {
      if (!event || typeof event !== "object") {
        throw new Error("each event must be an object");
      }
      if (typeof event.clientEventId !== "string" || event.clientEventId.trim().length === 0) {
        throw new Error("client_event_id is required");
      }
      if (seen.has(event.clientEventId)) {
        deduped += 1;
        continue;
      }
      seen.add(event.clientEventId);

      if (!(event.occurredAt instanceof Date) || Number.isNaN(event.occurredAt.getTime())) {
        throw new Error("occurred_at must be a valid date");
      }

      if (typeof event.actionType !== "string" || event.actionType.trim().length === 0) {
        throw new Error("action_type is required");
      }
      if (event.actionType.length > 100) {
        throw new Error("action_type must be at most 100 characters");
      }

      if (event.resourceType && event.resourceType.length > 100) {
        throw new Error("resource_type must be at most 100 characters");
      }

      if (event.resourceId && !uuidRegex.test(event.resourceId)) {
        throw new Error("resource_id must be a UUID");
      }

      const inserted = await this.repo.writeIdempotent({
        tenantId: params.tenantId,
        branchId: params.branchId,
        employeeId: params.employeeId,
        actorRole: params.actorRole,
        actionType: event.actionType,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        outcome: event.outcome,
        denialReason: event.denialReason,
        occurredAt: event.occurredAt,
        clientEventId: event.clientEventId,
        details: event.details,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      });

      if (inserted) {
        ingested += 1;
      } else {
        deduped += 1;
      }
    }

    return { ingested, deduped };
  }
}
