import type { Pool } from "pg";
import { TransactionManager } from "../../../../../platform/db/transactionManager.js";
import { V0CommandOutboxRepository } from "../../../../../platform/outbox/repository.js";
import { V0AuditService } from "../../../audit/app/service.js";
import { V0AuditRepository } from "../../../audit/infra/repository.js";
import { V0OrgAccountError, type OrgActorContext } from "../../common/error.js";
import { V0BranchService } from "../app/service.js";
import { StubFirstBranchPaymentVerifier } from "../app/payment-verifier.js";
import { V0BranchRepository } from "../infra/repository.js";

type AuditOutcome = "SUCCESS" | "REJECTED" | "FAILED";

export async function executeInitiateFirstBranchActivationCommand(input: {
  db: Pool;
  actor: OrgActorContext;
  branchName: unknown;
  idempotencyKey: string | null;
  actionKey: string;
  eventType: string;
  endpoint: string;
}): Promise<{
  draftId: string;
  tenantId: string;
  branchName: string;
  draftStatus: "PENDING_PAYMENT";
  invoice: {
    invoiceId: string;
    status: "ISSUED";
    currency: "USD";
    totalAmountUsd: string;
    issuedAt: string;
    paidAt: string | null;
  };
  created: boolean;
}> {
  const transactionManager = new TransactionManager(input.db);

  return transactionManager.withTransaction(async (client) => {
    const txService = new V0BranchService(
      new V0BranchRepository(client),
      new StubFirstBranchPaymentVerifier()
    );
    const txAuditService = new V0AuditService(new V0AuditRepository(client));
    const txOutboxRepository = new V0CommandOutboxRepository(client);

    const commandData = await txService.initiateFirstBranchActivation({
      actor: input.actor,
      branchName: String(input.branchName ?? ""),
    });

    if (commandData.created) {
      const dedupeKey = buildAuditDedupeKey(
        input.actionKey,
        input.idempotencyKey,
        "SUCCESS"
      );
      await txAuditService.recordEvent({
        tenantId: commandData.tenantId,
        branchId: null,
        actorAccountId: input.actor.accountId,
        actionKey: input.actionKey,
        outcome: "SUCCESS",
        entityType: "branch_activation_draft",
        entityId: commandData.draftId,
        dedupeKey,
        metadata: {
          endpoint: input.endpoint,
          invoiceId: commandData.invoice.invoiceId,
          invoiceStatus: commandData.invoice.status,
        },
      });

      await txOutboxRepository.insertEvent({
        tenantId: commandData.tenantId,
        branchId: null,
        actionKey: input.actionKey,
        eventType: input.eventType,
        actorType: "ACCOUNT",
        actorId: input.actor.accountId,
        entityType: "branch_activation_draft",
        entityId: commandData.draftId,
        outcome: "SUCCESS",
        dedupeKey,
        payload: {
          endpoint: input.endpoint,
          invoiceId: commandData.invoice.invoiceId,
          invoiceStatus: commandData.invoice.status,
        },
      });
    }

    return commandData;
  });
}

export async function executeConfirmFirstBranchActivationCommand(input: {
  db: Pool;
  actor: OrgActorContext;
  draftId: unknown;
  paymentToken: unknown;
  idempotencyKey: string | null;
  actionKey: string;
  eventType: string;
  endpoint: string;
}): Promise<{
  draftId: string;
  branchId: string;
  tenantId: string;
  branchName: string;
  status: string;
  invoiceId: string;
  paymentConfirmationRef: string | null;
  created: boolean;
}> {
  const transactionManager = new TransactionManager(input.db);

  return transactionManager.withTransaction(async (client) => {
    const txService = new V0BranchService(
      new V0BranchRepository(client),
      new StubFirstBranchPaymentVerifier()
    );
    const txAuditService = new V0AuditService(new V0AuditRepository(client));
    const txOutboxRepository = new V0CommandOutboxRepository(client);

    const commandData = await txService.confirmFirstBranchActivation({
      actor: input.actor,
      draftId: String(input.draftId ?? ""),
      paymentToken: String(input.paymentToken ?? ""),
    });

    if (commandData.created) {
      const dedupeKey = buildAuditDedupeKey(
        input.actionKey,
        input.idempotencyKey,
        "SUCCESS"
      );
      await txAuditService.recordEvent({
        tenantId: commandData.tenantId,
        branchId: commandData.branchId,
        actorAccountId: input.actor.accountId,
        actionKey: input.actionKey,
        outcome: "SUCCESS",
        entityType: "branch",
        entityId: commandData.branchId,
        dedupeKey,
        metadata: {
          endpoint: input.endpoint,
          draftId: commandData.draftId,
          invoiceId: commandData.invoiceId,
          paymentConfirmationRef: commandData.paymentConfirmationRef,
        },
      });

      await txOutboxRepository.insertEvent({
        tenantId: commandData.tenantId,
        branchId: commandData.branchId,
        actionKey: input.actionKey,
        eventType: input.eventType,
        actorType: "ACCOUNT",
        actorId: input.actor.accountId,
        entityType: "branch",
        entityId: commandData.branchId,
        outcome: "SUCCESS",
        dedupeKey,
        payload: {
          endpoint: input.endpoint,
          draftId: commandData.draftId,
          invoiceId: commandData.invoiceId,
          paymentConfirmationRef: commandData.paymentConfirmationRef,
        },
      });
    }

    return commandData;
  });
}

function buildAuditDedupeKey(
  actionKey: string,
  idempotencyKey: string | null,
  outcome: AuditOutcome
): string | null {
  const key = normalizeOptionalString(idempotencyKey);
  if (!key) {
    return null;
  }
  return `${actionKey}:${outcome}:${key}`;
}

function normalizeOptionalString(input: unknown): string | null {
  const normalized = String(input ?? "").trim();
  return normalized ? normalized : null;
}

export function mapFirstBranchActivationError(error: unknown): never {
  if (error instanceof V0OrgAccountError) {
    throw error;
  }
  throw error instanceof Error
    ? new V0OrgAccountError(500, error.message)
    : new V0OrgAccountError(500, "internal server error");
}
