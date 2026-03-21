import { V0AuditRepository } from "../infra/repository.js";
import {
  buildOffsetPaginatedResult,
  type OffsetPaginatedResult,
} from "../../../../shared/pagination.js";

export class V0AuditError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "V0AuditError";
  }
}

type ActorContext = {
  accountId: string;
  tenantId: string | null;
  branchId: string | null;
};

type AuditOutcome = "SUCCESS" | "REJECTED" | "FAILED";

export class V0AuditService {
  constructor(private readonly repo: V0AuditRepository) {}

  async recordEvent(input: {
    tenantId: string | null;
    branchId?: string | null;
    actorAccountId?: string | null;
    actionKey: string;
    outcome: AuditOutcome;
    reasonCode?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    dedupeKey?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    const tenantId = String(input.tenantId ?? "").trim();
    if (!tenantId) {
      throw new V0AuditError(403, "tenant context required");
    }

    const actionKey = String(input.actionKey ?? "").trim();
    if (!actionKey) {
      throw new V0AuditError(422, "actionKey is required");
    }

    await this.repo.insertEvent({
      tenantId,
      branchId: normalizeOptional(input.branchId),
      actorAccountId: normalizeOptional(input.actorAccountId),
      actionKey,
      outcome: input.outcome,
      reasonCode: normalizeOptional(input.reasonCode),
      entityType: normalizeOptional(input.entityType),
      entityId: normalizeOptional(input.entityId),
      dedupeKey: normalizeOptional(input.dedupeKey),
      metadata: input.metadata ?? null,
    });
  }

  async listTenantEvents(input: {
    actor: ActorContext;
    branchId?: string;
    actionKey?: string;
    outcome?: string;
    limit?: number;
    offset?: number;
  }): Promise<OffsetPaginatedResult<Record<string, unknown>>> {
    const tenantId = assertTenantContext(input.actor);
    const branchId = normalizeOptional(input.branchId);
    if (branchId && !isUuid(branchId)) {
      throw new V0AuditError(422, "branchId must be a valid UUID");
    }
    const outcome = normalizeOutcome(input.outcome);
    const actionKey = normalizeOptional(input.actionKey);
    const limit = normalizeLimit(input.limit);
    const offset = normalizeOffset(input.offset);
    const [rows, total] = await Promise.all([
      this.repo.listTenantEvents({
        tenantId,
        branchId,
        actionKey,
        outcome,
        limit,
        offset,
      }),
      this.repo.countTenantEvents({
        tenantId,
        branchId,
        actionKey,
        outcome,
      }),
    ]);

    return buildOffsetPaginatedResult({
      items: rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        branchId: row.branch_id,
        actorAccountId: row.actor_account_id,
        actionKey: row.action_key,
        outcome: row.outcome,
        reasonCode: row.reason_code,
        entityType: row.entity_type,
        entityId: row.entity_id,
        metadata: row.metadata,
        createdAt: row.created_at.toISOString(),
      })),
      limit,
      offset,
      total,
    });
  }
}

function assertTenantContext(actor: ActorContext): string {
  const accountId = String(actor.accountId ?? "").trim();
  const tenantId = String(actor.tenantId ?? "").trim();
  if (!accountId) {
    throw new V0AuditError(401, "authentication required");
  }
  if (!tenantId) {
    throw new V0AuditError(403, "tenant context required");
  }
  return tenantId;
}

function normalizeOptional(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function normalizeLimit(limit: number | undefined): number {
  const parsed = Number(limit ?? 50);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }
  return Math.min(Math.floor(parsed), 200);
}

function normalizeOffset(offset: number | undefined): number {
  const parsed = Number(offset ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.floor(parsed);
}

function normalizeOutcome(input: string | undefined): AuditOutcome | null {
  const value = String(input ?? "").trim();
  if (!value) {
    return null;
  }
  const upper = value.toUpperCase();
  if (upper === "SUCCESS" || upper === "REJECTED" || upper === "FAILED") {
    return upper;
  }
  throw new V0AuditError(422, "outcome must be SUCCESS, REJECTED, or FAILED");
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
