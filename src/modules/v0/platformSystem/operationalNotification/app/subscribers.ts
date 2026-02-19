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

  // NOTE: Future hooks for sale void flow:
  // - ON-01 from explicit void-request pending event (not from sale VOID_PENDING state)
  // - ON-02 / ON-03 from approval/rejection completion events
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
      await input.service.listOperationalRecipientAccountIdsForCashSessionZView({
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
