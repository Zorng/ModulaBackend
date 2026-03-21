import { log } from "#logger";
import { eventBus } from "../../../../../platform/events/index.js";
import { V0OperationalNotificationService } from "./service.js";

type V0OutboxBusEvent = {
  type: string;
  tenantId: string;
  branchId: string | null;
  entityId: string;
};

let registered = false;

export function registerOperationalNotificationSubscribers(
  service: V0OperationalNotificationService
): void {
  if (registered) {
    return;
  }
  registered = true;

  eventBus.subscribe(
    "CASH_SESSION_CLOSED",
    async (event: unknown) => {
      const mapped = asOutboxBusEvent(event);
      if (!mapped) {
        return;
      }
      await emitCashSessionClosedNotification({ service, event: mapped });
    }
  );

  eventBus.subscribe(
    "CASH_SESSION_FORCE_CLOSED",
    async (event: unknown) => {
      const mapped = asOutboxBusEvent(event);
      if (!mapped) {
        return;
      }
      await emitCashSessionClosedNotification({ service, event: mapped });
    }
  );

  eventBus.subscribe(
    "SALE_VOID_REQUESTED",
    async (event: unknown) => {
      const mapped = asOutboxBusEvent(event);
      if (!mapped) {
        return;
      }
      await emitVoidApprovalNeededNotification({ service, event: mapped });
    }
  );

  eventBus.subscribe(
    "SALE_VOID_APPROVED",
    async (event: unknown) => {
      const mapped = asOutboxBusEvent(event);
      if (!mapped) {
        return;
      }
      await emitVoidResolutionNotification({
        service,
        event: mapped,
        expectedStatus: "APPROVED",
        notificationType: "VOID_APPROVED",
        title: "Void approved",
        failureEvent: "operationalNotification.saleVoidApproved.emit_failed",
      });
    }
  );

  eventBus.subscribe(
    "SALE_VOID_REJECTED",
    async (event: unknown) => {
      const mapped = asOutboxBusEvent(event);
      if (!mapped) {
        return;
      }
      await emitVoidResolutionNotification({
        service,
        event: mapped,
        expectedStatus: "REJECTED",
        notificationType: "VOID_REJECTED",
        title: "Void rejected",
        failureEvent: "operationalNotification.saleVoidRejected.emit_failed",
      });
    }
  );
}

async function emitCashSessionClosedNotification(input: {
  service: V0OperationalNotificationService;
  event: V0OutboxBusEvent;
}): Promise<void> {
  const tenantId = normalize(input.event.tenantId);
  const branchId = normalize(input.event.branchId);
  const cashSessionId = normalize(input.event.entityId);
  if (!tenantId || !branchId || !cashSessionId) {
    return;
  }

  try {
    const closeContext = await input.service.getCashSessionCloseContext({
      tenantId,
      cashSessionId,
    });
    if (!closeContext) {
      return;
    }

    const recipientAccountIds =
      await input.service.listOperationalRecipientAccountIdsForBranchManagerialReview({
        tenantId,
        branchId,
      });

    if (recipientAccountIds.length === 0) {
      return;
    }

    const title =
      closeContext.close_reason === "FORCE_CLOSE"
        ? "Cash session force-closed"
        : "Cash session closed";
    const body = `Variance USD ${formatMoney(closeContext.variance_usd)}, KHR ${formatMoney(
      closeContext.variance_khr
    )}`;

    await input.service.emit({
      tenantId,
      branchId,
      type: "CASH_SESSION_CLOSED",
      subjectType: "CASH_SESSION",
      subjectId: cashSessionId,
      title,
      body,
      dedupeKey: `CASH_SESSION_CLOSED:${branchId}:${cashSessionId}`,
      payload: {
        cashSessionId,
        closeReason: closeContext.close_reason,
        closedAt: closeContext.closed_at.toISOString(),
        varianceUsd: closeContext.variance_usd,
        varianceKhr: closeContext.variance_khr,
      },
      recipientAccountIds,
      });
  } catch (error) {
    // Best-effort by design: emission failure must not break business flow or outbox progression.
    log.error("operationalNotification.cashSessionClosed.emit_failed", {
      event: "operationalNotification.cashSessionClosed.emit_failed",
      eventType: input.event.type,
      tenantId,
      branchId,
      cashSessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function emitVoidApprovalNeededNotification(input: {
  service: V0OperationalNotificationService;
  event: V0OutboxBusEvent;
}): Promise<void> {
  const tenantId = normalize(input.event.tenantId);
  const branchId = normalize(input.event.branchId);
  const voidRequestId = normalize(input.event.entityId);
  if (!tenantId || !branchId || !voidRequestId) {
    return;
  }

  try {
    const context = await input.service.getVoidRequestNotificationContext({
      tenantId,
      branchId,
      voidRequestId,
    });
    if (!context || context.status !== "PENDING") {
      return;
    }

    const recipientAccountIds =
      await input.service.listOperationalRecipientAccountIdsForBranchManagerialReview({
        tenantId,
        branchId,
      });
    if (recipientAccountIds.length === 0) {
      return;
    }

    await input.service.emit({
      tenantId,
      branchId,
      type: "VOID_APPROVAL_NEEDED",
      subjectType: "SALE",
      subjectId: context.sale_id,
      title: "Void approval needed",
      body: `Reason: ${context.reason}`,
      dedupeKey: `VOID_APPROVAL_NEEDED:${branchId}:${context.void_request_id}`,
      payload: {
        saleId: context.sale_id,
        voidRequestId: context.void_request_id,
        status: context.status,
        reason: context.reason,
        reviewNote: context.review_note,
        requestedByAccountId: context.requested_by_account_id,
        reviewedByAccountId: context.reviewed_by_account_id,
        requestedAt: context.requested_at.toISOString(),
        reviewedAt: context.reviewed_at?.toISOString() ?? null,
      },
      recipientAccountIds,
    });
  } catch (error) {
    log.error("operationalNotification.saleVoidRequest.emit_failed", {
      event: "operationalNotification.saleVoidRequest.emit_failed",
      eventType: input.event.type,
      tenantId,
      branchId,
      voidRequestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function emitVoidResolutionNotification(input: {
  service: V0OperationalNotificationService;
  event: V0OutboxBusEvent;
  expectedStatus: "APPROVED" | "REJECTED";
  notificationType: "VOID_APPROVED" | "VOID_REJECTED";
  title: string;
  failureEvent: string;
}): Promise<void> {
  const tenantId = normalize(input.event.tenantId);
  const branchId = normalize(input.event.branchId);
  const voidRequestId = normalize(input.event.entityId);
  if (!tenantId || !branchId || !voidRequestId) {
    return;
  }

  try {
    const context = await input.service.getVoidRequestNotificationContext({
      tenantId,
      branchId,
      voidRequestId,
    });
    if (!context || context.status !== input.expectedStatus) {
      return;
    }

    const recipientAccountIds = [context.requested_by_account_id].filter(
      (value, index, values) => value.length > 0 && values.indexOf(value) === index
    );
    if (recipientAccountIds.length === 0) {
      return;
    }

    const reviewSummary = normalize(context.review_note);
    const body =
      input.expectedStatus === "APPROVED"
        ? reviewSummary
          ? `Void request approved: ${reviewSummary}`
          : "Void request approved"
        : reviewSummary
          ? `Void request rejected: ${reviewSummary}`
          : "Void request rejected";

    await input.service.emit({
      tenantId,
      branchId,
      type: input.notificationType,
      subjectType: "SALE",
      subjectId: context.sale_id,
      title: input.title,
      body,
      dedupeKey: `${input.notificationType}:${branchId}:${context.void_request_id}`,
      payload: {
        saleId: context.sale_id,
        voidRequestId: context.void_request_id,
        status: context.status,
        reason: context.reason,
        reviewNote: context.review_note,
        requestedByAccountId: context.requested_by_account_id,
        reviewedByAccountId: context.reviewed_by_account_id,
        requestedAt: context.requested_at.toISOString(),
        reviewedAt: context.reviewed_at?.toISOString() ?? null,
      },
      recipientAccountIds,
    });
  } catch (error) {
    log.error(input.failureEvent, {
      event: input.failureEvent,
      eventType: input.event.type,
      tenantId,
      branchId,
      voidRequestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function normalize(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function formatMoney(value: number): string {
  return value.toFixed(2);
}

function asOutboxBusEvent(value: unknown): V0OutboxBusEvent | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const type = normalize(raw.type);
  const tenantId = normalize(raw.tenantId);
  const entityId = normalize(raw.entityId);
  if (!type || !tenantId || !entityId) {
    return null;
  }
  const branchId = normalize(raw.branchId);
  return {
    type,
    tenantId,
    branchId,
    entityId,
  };
}
