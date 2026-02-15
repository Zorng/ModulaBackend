import { V0AttendanceRepository } from "../infra/repository.js";

export class V0AttendanceError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "V0AttendanceError";
  }
}

type ActorContext = {
  accountId: string;
  tenantId: string | null;
  branchId: string | null;
};

export class V0AttendanceService {
  constructor(private readonly repo: V0AttendanceRepository) {}

  async checkIn(input: {
    actor: ActorContext;
    occurredAt?: string;
  }) {
    const scope = assertBranchContext(input.actor);
    const occurredAt = parseOccurredAt(input.occurredAt);

    const latest = await this.repo.findLatestRecord({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      accountId: scope.accountId,
    });
    if (latest?.type === "CHECK_IN") {
      throw new V0AttendanceError(409, "already checked in");
    }

    const created = await this.repo.createRecord({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      accountId: scope.accountId,
      type: "CHECK_IN",
      occurredAt,
    });
    return mapRecord(created);
  }

  async checkOut(input: {
    actor: ActorContext;
    occurredAt?: string;
  }) {
    const scope = assertBranchContext(input.actor);
    const occurredAt = parseOccurredAt(input.occurredAt);

    const latest = await this.repo.findLatestRecord({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      accountId: scope.accountId,
    });
    if (!latest || latest.type !== "CHECK_IN") {
      throw new V0AttendanceError(409, "no active check-in");
    }

    const created = await this.repo.createRecord({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      accountId: scope.accountId,
      type: "CHECK_OUT",
      occurredAt,
    });
    return mapRecord(created);
  }

  async listMine(input: {
    actor: ActorContext;
    limit?: number;
  }) {
    const scope = assertBranchContext(input.actor);
    const limit = normalizeLimit(input.limit);

    const rows = await this.repo.listRecordsForActor({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      accountId: scope.accountId,
      limit,
    });
    return rows.map(mapRecord);
  }
}

function assertBranchContext(actor: ActorContext): {
  accountId: string;
  tenantId: string;
  branchId: string;
} {
  const accountId = String(actor.accountId ?? "").trim();
  const tenantId = String(actor.tenantId ?? "").trim();
  const branchId = String(actor.branchId ?? "").trim();

  if (!accountId) {
    throw new V0AttendanceError(401, "authentication required");
  }
  if (!tenantId) {
    throw new V0AttendanceError(403, "tenant context required");
  }
  if (!branchId) {
    throw new V0AttendanceError(403, "branch context required");
  }

  return { accountId, tenantId, branchId };
}

function parseOccurredAt(input?: string): Date {
  if (!input) {
    return new Date();
  }
  const value = new Date(input);
  if (Number.isNaN(value.getTime())) {
    throw new V0AttendanceError(422, "occurredAt must be a valid ISO timestamp");
  }
  return value;
}

function normalizeLimit(input: number | undefined): number {
  const n = Number(input ?? 50);
  if (!Number.isFinite(n) || n <= 0) {
    return 50;
  }
  return Math.min(Math.floor(n), 200);
}

function mapRecord(row: {
  id: string;
  tenant_id: string;
  branch_id: string;
  account_id: string;
  type: "CHECK_IN" | "CHECK_OUT";
  occurred_at: Date;
  created_at: Date;
}) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    accountId: row.account_id,
    type: row.type,
    occurredAt: row.occurred_at.toISOString(),
    createdAt: row.created_at.toISOString(),
  };
}
