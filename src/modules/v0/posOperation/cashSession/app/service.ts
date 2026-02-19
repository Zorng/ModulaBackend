import { normalizeOptionalString } from "../../../../../shared/utils/string.js";
import type {
  CashCloseReason,
  CashMovementRow,
  CashMovementTotalsRow,
  CashMovementType,
  CashSessionRow,
  CashSessionStatus,
} from "../infra/repository.js";
import { V0CashSessionRepository } from "../infra/repository.js";

type ActorContext = {
  accountId: string;
  tenantId: string | null;
  branchId: string | null;
};

type SessionListStatusFilter = "open" | "closed" | "force_closed" | "all";

type SessionListItemDto = {
  id: string;
  status: CashSessionStatus;
  openedByName: string;
  openedAt: string;
  closedAt: string | null;
};

type CashSessionDto = {
  id: string;
  tenantId: string;
  branchId: string;
  openedByAccountId: string;
  openedAt: string;
  status: CashSessionStatus;
  openingFloatUsd: number;
  openingFloatKhr: number;
  openingNote: string | null;
  closedByAccountId: string | null;
  closedAt: string | null;
  closeReason: CashCloseReason | null;
  closeNote: string | null;
  createdAt: string;
  updatedAt: string;
};

type CashMovementDto = {
  id: string;
  tenantId: string;
  branchId: string;
  sessionId: string;
  movementType: CashMovementType;
  amountUsdDelta: number;
  amountKhrDelta: number;
  reason: string | null;
  sourceRefType: "SALE" | "MANUAL" | "SYSTEM";
  sourceRefId: string | null;
  idempotencyKey: string;
  recordedByAccountId: string;
  occurredAt: string;
  createdAt: string;
};

type XReportDto = {
  sessionId: string;
  status: CashSessionStatus;
  openedByName: string;
  openedAt: string;
  closedAt: string | null;
  openingFloatUsd: number;
  openingFloatKhr: number;
  totalSalesNonCashUsd: number;
  totalSalesNonCashKhr: number;
  totalSalesKhqrUsd: number;
  totalSalesKhqrKhr: number;
  totalSaleInUsd: number;
  totalSaleInKhr: number;
  totalRefundOutUsd: number;
  totalRefundOutKhr: number;
  totalManualInUsd: number;
  totalManualInKhr: number;
  totalManualOutUsd: number;
  totalManualOutKhr: number;
  totalAdjustmentUsd: number;
  totalAdjustmentKhr: number;
  expectedCashUsd: number;
  expectedCashKhr: number;
};

type ZReportDto = XReportDto & {
  countedCashUsd: number;
  countedCashKhr: number;
  varianceUsd: number;
  varianceKhr: number;
  closedByName: string;
  closeReason: "NORMAL_CLOSE" | "FORCE_CLOSE";
};

export class V0CashSessionError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code?: string
  ) {
    super(message);
    this.name = "V0CashSessionError";
  }
}

export class V0CashSessionService {
  constructor(private readonly repo: V0CashSessionRepository) {}

  async openSession(input: {
    actor: ActorContext;
    body: unknown;
  }): Promise<CashSessionDto> {
    const actor = await this.assertBranchContext(input.actor);
    const role = await this.resolveActorRole(actor);
    assertCanOpenForRole(role);
    const body = parseOpenBody(input.body);

    const existing = await this.repo.getActiveSessionByBranch({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
    });
    if (existing) {
      throw new V0CashSessionError(
        409,
        "cash session already open for this branch",
        "CASH_SESSION_ALREADY_OPEN"
      );
    }

    const created = await this.repo.createSession({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      openedByAccountId: actor.accountId,
      openingFloatUsd: body.openingFloatUsd,
      openingFloatKhr: body.openingFloatKhr,
      openingNote: body.note,
    });
    return mapSession(created);
  }

  async readActiveSession(input: {
    actor: ActorContext;
  }): Promise<{ session: CashSessionDto }> {
    const actor = await this.assertBranchContext(input.actor);
    const role = await this.resolveActorRole(actor);
    const session = await this.repo.getActiveSessionByBranch({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
    });
    if (!session) {
      throw new V0CashSessionError(404, "no active cash session", "CASH_SESSION_NOT_FOUND");
    }
    if (role === "CASHIER" && session.opened_by_account_id !== actor.accountId) {
      throw new V0CashSessionError(
        403,
        "cashier can only access own session",
        "CASH_SESSION_FORBIDDEN_SELF_SCOPE"
      );
    }
    return { session: mapSession(session) };
  }

  async listSessions(input: {
    actor: ActorContext;
    status?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }): Promise<SessionListItemDto[]> {
    const actor = await this.assertBranchContext(input.actor);
    const role = await this.resolveActorRole(actor);
    const status = parseListStatusFilter(input.status);
    const from = parseOptionalDate(input.from, "from");
    const to = parseOptionalDate(input.to, "to");
    if (from && to && from > to) {
      throw new V0CashSessionError(422, "from must be before to", "CASH_SESSION_INVALID_RANGE");
    }

    const rows = await this.repo.listSessions({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      status: mapListStatusToRepo(status),
      from,
      to,
      openedByAccountId: role === "CASHIER" ? actor.accountId : null,
      limit: normalizeLimit(input.limit),
      offset: normalizeOffset(input.offset),
    });
    const nameMap = await this.repo.listAccountDisplayNames({
      accountIds: uniq(rows.map((row) => row.opened_by_account_id)),
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      openedByName: nameMap.get(row.opened_by_account_id) ?? row.opened_by_account_id,
      openedAt: row.opened_at.toISOString(),
      closedAt: row.closed_at ? row.closed_at.toISOString() : null,
    }));
  }

  async getSession(input: {
    actor: ActorContext;
    sessionId: string;
  }): Promise<CashSessionDto> {
    const actor = await this.assertBranchContext(input.actor);
    const role = await this.resolveActorRole(actor);
    const session = await this.requireSessionForBranch(actor, input.sessionId);
    await this.assertSessionOwnershipForCashier(role, actor.accountId, session);
    return mapSession(session);
  }

  async listSessionMovements(input: {
    actor: ActorContext;
    sessionId: string;
    limit?: number;
    offset?: number;
  }): Promise<CashMovementDto[]> {
    const actor = await this.assertBranchContext(input.actor);
    const role = await this.resolveActorRole(actor);
    const session = await this.requireSessionForBranch(actor, input.sessionId);
    await this.assertSessionOwnershipForCashier(role, actor.accountId, session);
    const rows = await this.repo.listMovementsBySession({
      tenantId: actor.tenantId,
      sessionId: session.id,
      limit: normalizeLimit(input.limit),
      offset: normalizeOffset(input.offset),
    });
    return rows.map(mapMovement);
  }

  async closeSession(input: {
    actor: ActorContext;
    sessionId: string;
    body: unknown;
  }): Promise<CashSessionDto> {
    const actor = await this.assertBranchContext(input.actor);
    const role = await this.resolveActorRole(actor);
    assertCanCloseForRole(role);
    const body = parseCloseBody(input.body);

    const session = await this.requireSessionForBranch(actor, input.sessionId);
    await this.assertSessionOwnershipForCashier(role, actor.accountId, session);
    if (session.status !== "OPEN") {
      throw new V0CashSessionError(
        409,
        "cash session is not open",
        "CASH_SESSION_NOT_OPEN"
      );
    }

    const totals = await this.repo.summarizeMovementTotals({
      tenantId: actor.tenantId,
      sessionId: session.id,
    });
    const expectedCashUsd = roundMoney(session.opening_float_usd + totals.total_cash_delta_usd);
    const expectedCashKhr = roundMoney(session.opening_float_khr + totals.total_cash_delta_khr);
    const varianceUsd = roundMoney(body.countedCashUsd - expectedCashUsd);
    const varianceKhr = roundMoney(body.countedCashKhr - expectedCashKhr);
    const closedAt = new Date();

    const closed = await this.repo.closeSession({
      tenantId: actor.tenantId,
      sessionId: session.id,
      status: "CLOSED",
      closeReason: "NORMAL_CLOSE",
      closedByAccountId: actor.accountId,
      closeNote: body.note,
      closedAt,
    });
    if (!closed) {
      throw new V0CashSessionError(
        409,
        "cash session could not be closed",
        "CASH_SESSION_NOT_OPEN"
      );
    }

    await this.repo.upsertReconciliationSnapshot({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      cashSessionId: session.id,
      status: "CLOSED",
      openingFloatUsd: session.opening_float_usd,
      openingFloatKhr: session.opening_float_khr,
      ...mapTotals(totals),
      expectedCashUsd,
      expectedCashKhr,
      countedCashUsd: body.countedCashUsd,
      countedCashKhr: body.countedCashKhr,
      varianceUsd,
      varianceKhr,
      closeReason: "NORMAL_CLOSE",
      closedByAccountId: actor.accountId,
      closedAt,
    });

    return mapSession(closed);
  }

  async forceCloseSession(input: {
    actor: ActorContext;
    sessionId: string;
    body: unknown;
  }): Promise<CashSessionDto> {
    const actor = await this.assertBranchContext(input.actor);
    const role = await this.resolveActorRole(actor);
    assertCanForceCloseForRole(role);
    const body = parseForceCloseBody(input.body);

    const session = await this.requireSessionForBranch(actor, input.sessionId);
    if (session.status !== "OPEN") {
      throw new V0CashSessionError(
        409,
        "cash session is not open",
        "CASH_SESSION_NOT_OPEN"
      );
    }

    const totals = await this.repo.summarizeMovementTotals({
      tenantId: actor.tenantId,
      sessionId: session.id,
    });
    const expectedCashUsd = roundMoney(session.opening_float_usd + totals.total_cash_delta_usd);
    const expectedCashKhr = roundMoney(session.opening_float_khr + totals.total_cash_delta_khr);
    const countedCashUsd = body.countedCashUsd ?? expectedCashUsd;
    const countedCashKhr = body.countedCashKhr ?? expectedCashKhr;
    const varianceUsd = roundMoney(countedCashUsd - expectedCashUsd);
    const varianceKhr = roundMoney(countedCashKhr - expectedCashKhr);
    const closeNote = [body.reason, body.note].filter(Boolean).join(" | ");
    const closedAt = new Date();

    const closed = await this.repo.closeSession({
      tenantId: actor.tenantId,
      sessionId: session.id,
      status: "FORCE_CLOSED",
      closeReason: "FORCE_CLOSE",
      closedByAccountId: actor.accountId,
      closeNote,
      closedAt,
    });
    if (!closed) {
      throw new V0CashSessionError(
        409,
        "cash session could not be force-closed",
        "CASH_SESSION_NOT_OPEN"
      );
    }

    await this.repo.upsertReconciliationSnapshot({
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      cashSessionId: session.id,
      status: "FORCE_CLOSED",
      openingFloatUsd: session.opening_float_usd,
      openingFloatKhr: session.opening_float_khr,
      ...mapTotals(totals),
      expectedCashUsd,
      expectedCashKhr,
      countedCashUsd,
      countedCashKhr,
      varianceUsd,
      varianceKhr,
      closeReason: "FORCE_CLOSE",
      closedByAccountId: actor.accountId,
      closedAt,
    });

    return mapSession(closed);
  }

  async recordPaidIn(input: {
    actor: ActorContext;
    sessionId: string;
    body: unknown;
    idempotencyKey: string;
  }): Promise<CashMovementDto> {
    const actor = await this.assertBranchContext(input.actor);
    const role = await this.resolveActorRole(actor);
    assertCanWriteMovementForRole(role);
    const body = parsePaidInBody(input.body);
    const session = await this.requireOpenSessionForMovement(actor, input.sessionId, role);

    try {
      const movement = await this.repo.appendMovement({
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        cashSessionId: session.id,
        movementType: "MANUAL_IN",
        amountUsdDelta: body.amountUsd,
        amountKhrDelta: body.amountKhr,
        reason: body.reason,
        sourceRefType: "MANUAL",
        sourceRefId: null,
        idempotencyKey: `paid-in:${input.idempotencyKey}`,
        recordedByAccountId: actor.accountId,
      });
      return mapMovement(movement);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new V0CashSessionError(
          409,
          "duplicate paid-in movement",
          "CASH_MOVEMENT_DUPLICATE"
        );
      }
      throw error;
    }
  }

  async recordPaidOut(input: {
    actor: ActorContext;
    sessionId: string;
    body: unknown;
    idempotencyKey: string;
  }): Promise<CashMovementDto> {
    const actor = await this.assertBranchContext(input.actor);
    const role = await this.resolveActorRole(actor);
    assertCanWriteMovementForRole(role);
    const body = parsePaidOutBody(input.body);
    const session = await this.requireOpenSessionForMovement(actor, input.sessionId, role);

    try {
      const movement = await this.repo.appendMovement({
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        cashSessionId: session.id,
        movementType: "MANUAL_OUT",
        amountUsdDelta: body.amountUsd > 0 ? -body.amountUsd : body.amountUsd,
        amountKhrDelta: body.amountKhr > 0 ? -body.amountKhr : body.amountKhr,
        reason: body.reason,
        sourceRefType: "MANUAL",
        sourceRefId: null,
        idempotencyKey: `paid-out:${input.idempotencyKey}`,
        recordedByAccountId: actor.accountId,
      });
      return mapMovement(movement);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new V0CashSessionError(
          409,
          "duplicate paid-out movement",
          "CASH_MOVEMENT_DUPLICATE"
        );
      }
      throw error;
    }
  }

  async recordAdjustment(input: {
    actor: ActorContext;
    sessionId: string;
    body: unknown;
    idempotencyKey: string;
  }): Promise<CashMovementDto> {
    const actor = await this.assertBranchContext(input.actor);
    const role = await this.resolveActorRole(actor);
    assertCanAdjustForRole(role);
    const body = parseAdjustmentBody(input.body);
    const session = await this.requireOpenSessionForMovement(actor, input.sessionId, role);

    try {
      const movement = await this.repo.appendMovement({
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        cashSessionId: session.id,
        movementType: "ADJUSTMENT",
        amountUsdDelta: body.amountUsdDelta,
        amountKhrDelta: body.amountKhrDelta,
        reason: body.reason,
        sourceRefType: "MANUAL",
        sourceRefId: null,
        idempotencyKey: `adjustment:${input.idempotencyKey}`,
        recordedByAccountId: actor.accountId,
      });
      return mapMovement(movement);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new V0CashSessionError(
          409,
          "duplicate adjustment movement",
          "CASH_MOVEMENT_DUPLICATE"
        );
      }
      throw error;
    }
  }

  async getXReport(input: {
    actor: ActorContext;
    sessionId: string;
  }): Promise<XReportDto> {
    const actor = await this.assertBranchContext(input.actor);
    const role = await this.resolveActorRole(actor);
    const session = await this.requireSessionForBranch(actor, input.sessionId);
    await this.assertSessionOwnershipForCashier(role, actor.accountId, session);
    const totals = await this.repo.summarizeMovementTotals({
      tenantId: actor.tenantId,
      sessionId: session.id,
    });
    const expectedCashUsd = roundMoney(session.opening_float_usd + totals.total_cash_delta_usd);
    const expectedCashKhr = roundMoney(session.opening_float_khr + totals.total_cash_delta_khr);
    const nameMap = await this.repo.listAccountDisplayNames({
      accountIds: [session.opened_by_account_id],
    });
    return {
      sessionId: session.id,
      status: session.status,
      openedByName:
        nameMap.get(session.opened_by_account_id) ?? session.opened_by_account_id,
      openedAt: session.opened_at.toISOString(),
      closedAt: session.closed_at ? session.closed_at.toISOString() : null,
      openingFloatUsd: session.opening_float_usd,
      openingFloatKhr: session.opening_float_khr,
      ...mapTotals(totals),
      expectedCashUsd,
      expectedCashKhr,
    };
  }

  async getZReport(input: {
    actor: ActorContext;
    sessionId: string;
  }): Promise<ZReportDto> {
    const actor = await this.assertBranchContext(input.actor);
    const role = await this.resolveActorRole(actor);
    const session = await this.requireSessionForBranch(actor, input.sessionId);
    await this.assertSessionOwnershipForCashier(role, actor.accountId, session);
    if (session.status === "OPEN") {
      throw new V0CashSessionError(
        422,
        "session is still open",
        "CASH_SESSION_NOT_CLOSED"
      );
    }

    const snapshot = await this.repo.getReconciliationSnapshotBySession({
      tenantId: actor.tenantId,
      cashSessionId: session.id,
    });
    if (!snapshot) {
      throw new V0CashSessionError(
        404,
        "z report not found for session",
        "CASH_SESSION_Z_REPORT_NOT_FOUND"
      );
    }

    const nameMap = await this.repo.listAccountDisplayNames({
      accountIds: uniq([session.opened_by_account_id, snapshot.closed_by_account_id]),
    });

    return {
      sessionId: session.id,
      status: session.status,
      openedByName:
        nameMap.get(session.opened_by_account_id) ?? session.opened_by_account_id,
      openedAt: session.opened_at.toISOString(),
      closedAt: session.closed_at ? session.closed_at.toISOString() : null,
      openingFloatUsd: snapshot.opening_float_usd,
      openingFloatKhr: snapshot.opening_float_khr,
      totalSalesNonCashUsd: snapshot.total_sales_non_cash_usd,
      totalSalesNonCashKhr: snapshot.total_sales_non_cash_khr,
      totalSalesKhqrUsd: snapshot.total_sales_khqr_usd,
      totalSalesKhqrKhr: snapshot.total_sales_khqr_khr,
      totalSaleInUsd: snapshot.total_sale_in_usd,
      totalSaleInKhr: snapshot.total_sale_in_khr,
      totalRefundOutUsd: snapshot.total_refund_out_usd,
      totalRefundOutKhr: snapshot.total_refund_out_khr,
      totalManualInUsd: snapshot.total_manual_in_usd,
      totalManualInKhr: snapshot.total_manual_in_khr,
      totalManualOutUsd: snapshot.total_manual_out_usd,
      totalManualOutKhr: snapshot.total_manual_out_khr,
      totalAdjustmentUsd: snapshot.total_adjustment_usd,
      totalAdjustmentKhr: snapshot.total_adjustment_khr,
      expectedCashUsd: snapshot.expected_cash_usd,
      expectedCashKhr: snapshot.expected_cash_khr,
      countedCashUsd: snapshot.counted_cash_usd,
      countedCashKhr: snapshot.counted_cash_khr,
      varianceUsd: snapshot.variance_usd,
      varianceKhr: snapshot.variance_khr,
      closedByName:
        nameMap.get(snapshot.closed_by_account_id) ?? snapshot.closed_by_account_id,
      closeReason: snapshot.close_reason,
    };
  }

  private async assertBranchContext(actor: ActorContext): Promise<{
    accountId: string;
    tenantId: string;
    branchId: string;
  }> {
    const accountId = String(actor.accountId ?? "").trim();
    const tenantId = String(actor.tenantId ?? "").trim();
    const branchId = String(actor.branchId ?? "").trim();
    if (!accountId) {
      throw new V0CashSessionError(401, "authentication required");
    }
    if (!tenantId) {
      throw new V0CashSessionError(403, "tenant context required", "TENANT_CONTEXT_REQUIRED");
    }
    if (!branchId) {
      throw new V0CashSessionError(403, "branch context required", "BRANCH_CONTEXT_REQUIRED");
    }
    const branchOk = await this.repo.branchExistsAndActive({ tenantId, branchId });
    if (!branchOk) {
      throw new V0CashSessionError(404, "branch not found", "BRANCH_NOT_FOUND");
    }
    return { accountId, tenantId, branchId };
  }

  private async requireSessionForBranch(
    actor: { tenantId: string; branchId: string },
    rawSessionId: string
  ): Promise<CashSessionRow> {
    const sessionId = parseRequiredUuid(rawSessionId, "sessionId");
    const session = await this.repo.getSessionById({
      tenantId: actor.tenantId,
      sessionId,
    });
    if (!session || session.branch_id !== actor.branchId) {
      throw new V0CashSessionError(404, "cash session not found", "CASH_SESSION_NOT_FOUND");
    }
    return session;
  }

  private async requireOpenSessionForMovement(
    actor: { accountId: string; tenantId: string; branchId: string },
    sessionId: string,
    role: string
  ): Promise<CashSessionRow> {
    const session = await this.requireSessionForBranch(actor, sessionId);
    await this.assertSessionOwnershipForCashier(role, actor.accountId, session);
    if (session.status !== "OPEN") {
      throw new V0CashSessionError(
        409,
        "cash session is not open",
        "CASH_SESSION_NOT_OPEN"
      );
    }
    return session;
  }

  private async resolveActorRole(actor: {
    tenantId: string;
    accountId: string;
  }): Promise<string> {
    const role = await this.repo.getActorRoleInTenant({
      tenantId: actor.tenantId,
      accountId: actor.accountId,
    });
    if (!role) {
      throw new V0CashSessionError(403, "membership not found", "NO_MEMBERSHIP");
    }
    return role;
  }

  private async assertSessionOwnershipForCashier(
    role: string,
    actorAccountId: string,
    session: CashSessionRow
  ): Promise<void> {
    if (role === "CASHIER" && session.opened_by_account_id !== actorAccountId) {
      throw new V0CashSessionError(
        403,
        "cashier can only access own session",
        "CASH_SESSION_FORBIDDEN_SELF_SCOPE"
      );
    }
  }
}

function parseOpenBody(input: unknown): {
  openingFloatUsd: number;
  openingFloatKhr: number;
  note: string | null;
} {
  const data = asRecord(input, "body");
  const openingFloatUsd = parseMoneyNonNegative(data.openingFloatUsd, "openingFloatUsd");
  const openingFloatKhr = parseMoneyNonNegative(data.openingFloatKhr, "openingFloatKhr");
  return {
    openingFloatUsd,
    openingFloatKhr,
    note: normalizeOptionalString(data.note),
  };
}

function parseCloseBody(input: unknown): {
  countedCashUsd: number;
  countedCashKhr: number;
  note: string | null;
} {
  const data = asRecord(input, "body");
  return {
    countedCashUsd: parseMoneyNonNegative(data.countedCashUsd, "countedCashUsd"),
    countedCashKhr: parseMoneyNonNegative(data.countedCashKhr, "countedCashKhr"),
    note: normalizeOptionalString(data.note),
  };
}

function parseForceCloseBody(input: unknown): {
  countedCashUsd: number | null;
  countedCashKhr: number | null;
  reason: string;
  note: string | null;
} {
  const data = asRecord(input, "body");
  const reason = String(data.reason ?? "").trim();
  if (!reason) {
    throw new V0CashSessionError(422, "reason is required", "CASH_SESSION_FORCE_REASON_REQUIRED");
  }
  return {
    countedCashUsd: parseOptionalMoneyNonNegative(data.countedCashUsd, "countedCashUsd"),
    countedCashKhr: parseOptionalMoneyNonNegative(data.countedCashKhr, "countedCashKhr"),
    reason,
    note: normalizeOptionalString(data.note),
  };
}

function parsePaidInBody(input: unknown): {
  amountUsd: number;
  amountKhr: number;
  reason: string;
} {
  const data = asRecord(input, "body");
  const amountUsd = parseMoneyNonNegative(data.amountUsd, "amountUsd");
  const amountKhr = parseMoneyNonNegative(data.amountKhr, "amountKhr");
  if (amountUsd === 0 && amountKhr === 0) {
    throw new V0CashSessionError(
      422,
      "at least one amount must be non-zero",
      "CASH_MOVEMENT_AMOUNT_REQUIRED"
    );
  }
  const reason = String(data.reason ?? "").trim();
  if (!reason) {
    throw new V0CashSessionError(422, "reason is required", "CASH_MOVEMENT_REASON_REQUIRED");
  }
  return { amountUsd, amountKhr, reason };
}

function parsePaidOutBody(input: unknown): {
  amountUsd: number;
  amountKhr: number;
  reason: string;
} {
  const data = asRecord(input, "body");
  const amountUsd = parseMoneyNonNegative(data.amountUsd, "amountUsd");
  const amountKhr = parseMoneyNonNegative(data.amountKhr, "amountKhr");
  if (amountUsd === 0 && amountKhr === 0) {
    throw new V0CashSessionError(
      422,
      "at least one amount must be non-zero",
      "CASH_MOVEMENT_AMOUNT_REQUIRED"
    );
  }
  const reason = String(data.reason ?? "").trim();
  if (!reason) {
    throw new V0CashSessionError(422, "reason is required", "CASH_MOVEMENT_REASON_REQUIRED");
  }
  return { amountUsd, amountKhr, reason };
}

function parseAdjustmentBody(input: unknown): {
  amountUsdDelta: number;
  amountKhrDelta: number;
  reason: string;
} {
  const data = asRecord(input, "body");
  const amountUsdDelta = parseMoney(data.amountUsdDelta, "amountUsdDelta");
  const amountKhrDelta = parseMoney(data.amountKhrDelta, "amountKhrDelta");
  if (amountUsdDelta === 0 && amountKhrDelta === 0) {
    throw new V0CashSessionError(
      422,
      "at least one delta must be non-zero",
      "CASH_MOVEMENT_AMOUNT_REQUIRED"
    );
  }
  const reason = String(data.reason ?? "").trim();
  if (!reason) {
    throw new V0CashSessionError(422, "reason is required", "CASH_MOVEMENT_REASON_REQUIRED");
  }
  return { amountUsdDelta, amountKhrDelta, reason };
}

function parseListStatusFilter(input: string | undefined): SessionListStatusFilter {
  const value = String(input ?? "all").trim().toLowerCase();
  if (value === "open" || value === "closed" || value === "force_closed" || value === "all") {
    return value;
  }
  throw new V0CashSessionError(422, "invalid status filter", "CASH_SESSION_STATUS_INVALID");
}

function mapListStatusToRepo(
  status: SessionListStatusFilter
): CashSessionStatus | null {
  if (status === "open") return "OPEN";
  if (status === "closed") return "CLOSED";
  if (status === "force_closed") return "FORCE_CLOSED";
  return null;
}

function parseOptionalDate(input: string | undefined, field: string): Date | null {
  const value = String(input ?? "").trim();
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new V0CashSessionError(422, `${field} must be a valid ISO date`, "CASH_SESSION_DATE_INVALID");
  }
  return date;
}

function parseRequiredUuid(input: unknown, field: string): string {
  const value = String(input ?? "").trim();
  if (!isUuid(value)) {
    throw new V0CashSessionError(422, `${field} must be a valid UUID`);
  }
  return value;
}

function asRecord(input: unknown, label: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new V0CashSessionError(422, `${label} must be an object`);
  }
  return input as Record<string, unknown>;
}

function parseMoney(input: unknown, field: string): number {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) {
    throw new V0CashSessionError(422, `${field} must be a valid number`);
  }
  return roundMoney(parsed);
}

function parseMoneyNonNegative(input: unknown, field: string): number {
  const value = parseMoney(input, field);
  if (value < 0) {
    throw new V0CashSessionError(422, `${field} must be non-negative`);
  }
  return value;
}

function parseOptionalMoneyNonNegative(input: unknown, field: string): number | null {
  if (input === undefined || input === null || input === "") {
    return null;
  }
  return parseMoneyNonNegative(input, field);
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function uniq(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function mapSession(row: CashSessionRow): CashSessionDto {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    openedByAccountId: row.opened_by_account_id,
    openedAt: row.opened_at.toISOString(),
    status: row.status,
    openingFloatUsd: row.opening_float_usd,
    openingFloatKhr: row.opening_float_khr,
    openingNote: row.opening_note,
    closedByAccountId: row.closed_by_account_id,
    closedAt: row.closed_at ? row.closed_at.toISOString() : null,
    closeReason: row.close_reason,
    closeNote: row.close_note,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapMovement(row: CashMovementRow): CashMovementDto {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    sessionId: row.cash_session_id,
    movementType: row.movement_type,
    amountUsdDelta: row.amount_usd_delta,
    amountKhrDelta: row.amount_khr_delta,
    reason: row.reason,
    sourceRefType: row.source_ref_type,
    sourceRefId: row.source_ref_id,
    idempotencyKey: row.idempotency_key,
    recordedByAccountId: row.recorded_by_account_id,
    occurredAt: row.occurred_at.toISOString(),
    createdAt: row.created_at.toISOString(),
  };
}

function mapTotals(totals: CashMovementTotalsRow): Omit<XReportDto, "sessionId" | "status" | "openedByName" | "openedAt" | "closedAt" | "openingFloatUsd" | "openingFloatKhr" | "expectedCashUsd" | "expectedCashKhr"> {
  return {
    totalSalesNonCashUsd: totals.total_sales_non_cash_usd,
    totalSalesNonCashKhr: totals.total_sales_non_cash_khr,
    totalSalesKhqrUsd: totals.total_sales_khqr_usd,
    totalSalesKhqrKhr: totals.total_sales_khqr_khr,
    totalSaleInUsd: totals.total_sale_in_usd,
    totalSaleInKhr: totals.total_sale_in_khr,
    totalRefundOutUsd: totals.total_refund_out_usd,
    totalRefundOutKhr: totals.total_refund_out_khr,
    totalManualInUsd: totals.total_manual_in_usd,
    totalManualInKhr: totals.total_manual_in_khr,
    totalManualOutUsd: totals.total_manual_out_usd,
    totalManualOutKhr: totals.total_manual_out_khr,
    totalAdjustmentUsd: totals.total_adjustment_usd,
    totalAdjustmentKhr: totals.total_adjustment_khr,
  };
}

function assertCanOpenForRole(role: string): void {
  if (["OWNER", "ADMIN", "MANAGER", "CASHIER"].includes(role)) {
    return;
  }
  throw new V0CashSessionError(403, "permission denied", "PERMISSION_DENIED");
}

function assertCanCloseForRole(role: string): void {
  if (["OWNER", "ADMIN", "MANAGER", "CASHIER"].includes(role)) {
    return;
  }
  throw new V0CashSessionError(403, "permission denied", "PERMISSION_DENIED");
}

function assertCanForceCloseForRole(role: string): void {
  if (["OWNER", "ADMIN", "MANAGER"].includes(role)) {
    return;
  }
  throw new V0CashSessionError(403, "permission denied", "PERMISSION_DENIED");
}

function assertCanWriteMovementForRole(role: string): void {
  if (["OWNER", "ADMIN", "MANAGER", "CASHIER"].includes(role)) {
    return;
  }
  throw new V0CashSessionError(403, "permission denied", "PERMISSION_DENIED");
}

function assertCanAdjustForRole(role: string): void {
  if (["OWNER", "ADMIN", "MANAGER"].includes(role)) {
    return;
  }
  throw new V0CashSessionError(403, "permission denied", "PERMISSION_DENIED");
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string } | undefined)?.code;
  return code === "23505";
}
