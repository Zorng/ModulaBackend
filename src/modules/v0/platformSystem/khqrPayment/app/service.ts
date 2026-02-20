import type { V0AuthRequest } from "../../../auth/api/middleware.js";
import type {
  V0KhqrCurrency,
  V0KhqrPaymentAttemptRow,
  V0KhqrVerificationStatus,
} from "../infra/repository.js";
import { V0KhqrPaymentRepository } from "../infra/repository.js";
import type { V0KhqrPaymentProvider, V0KhqrWebhookEvent } from "./payment-provider.js";

type ActorScope = NonNullable<V0AuthRequest["v0Auth"]>;

export class V0KhqrPaymentError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "V0KhqrPaymentError";
  }
}

export class V0KhqrPaymentService {
  constructor(
    private readonly repo: V0KhqrPaymentRepository,
    private readonly provider: V0KhqrPaymentProvider
  ) {}

  async registerAttempt(input: {
    actor: ActorScope;
    saleId: string;
    md5: string;
    amount: number;
    currency: V0KhqrCurrency;
    toAccountId: string;
    expiresAt: Date | null;
  }): Promise<{ created: boolean; attempt: V0KhqrPaymentAttemptView }> {
    const scope = assertBranchScope(input.actor);
    const existing = await this.repo.findAttemptByMd5({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      md5: input.md5,
    });
    if (existing) {
      return {
        created: false,
        attempt: mapAttempt(existing),
      };
    }

    const created = await this.repo.createAttempt({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      saleId: input.saleId,
      md5: input.md5,
      expectedAmount: input.amount,
      expectedCurrency: input.currency,
      expectedToAccountId: input.toAccountId,
      expiresAt: input.expiresAt,
      createdByAccountId: scope.accountId,
    });

    await this.repo.markOtherActiveAttemptsAsSuperseded({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      saleId: input.saleId,
      supersededByAttemptId: created.id,
    });

    return {
      created: true,
      attempt: mapAttempt(created),
    };
  }

  async getAttemptById(input: {
    actor: ActorScope;
    attemptId: string;
  }): Promise<V0KhqrPaymentAttemptView> {
    const scope = assertBranchScope(input.actor);
    const found = await this.repo.findAttemptById({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      attemptId: input.attemptId,
    });
    if (!found) {
      throw new V0KhqrPaymentError(404, "KHQR_ATTEMPT_NOT_FOUND", "khqr attempt not found");
    }
    return mapAttempt(found);
  }

  async getAttemptByMd5(input: {
    actor: ActorScope;
    md5: string;
  }): Promise<V0KhqrPaymentAttemptView> {
    const scope = assertBranchScope(input.actor);
    const found = await this.repo.findAttemptByMd5({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      md5: input.md5,
    });
    if (!found) {
      throw new V0KhqrPaymentError(404, "KHQR_ATTEMPT_NOT_FOUND", "khqr attempt not found");
    }
    return mapAttempt(found);
  }

  async confirmByMd5(input: {
    actor: ActorScope;
    md5: string;
  }): Promise<{
    verificationStatus: V0KhqrVerificationStatus;
    attempt: V0KhqrPaymentAttemptView;
    mismatchReasonCode: string | null;
  }> {
    const scope = assertBranchScope(input.actor);
    const lockedAttempt = await this.repo.lockAttemptByMd5ForUpdate({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      md5: input.md5,
    });
    if (!lockedAttempt) {
      throw new V0KhqrPaymentError(404, "KHQR_ATTEMPT_NOT_FOUND", "khqr attempt not found");
    }

    const verification = await this.provider.verifyByMd5({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      md5: lockedAttempt.md5,
      expectedAmount: lockedAttempt.expected_amount,
      expectedCurrency: lockedAttempt.expected_currency,
      expectedToAccountId: lockedAttempt.expected_to_account_id,
    });

    const updatedAttempt = await this.persistVerificationOutcome({
      attempt: lockedAttempt,
      verificationStatus: verification.verificationStatus,
      reasonCode: verification.reasonCode ?? defaultReasonCode(verification.verificationStatus),
      providerReference: verification.providerReference,
      providerConfirmedAmount: verification.providerConfirmedAmount,
      providerConfirmedCurrency: verification.providerConfirmedCurrency,
      providerConfirmedToAccountId: verification.providerConfirmedToAccountId,
      providerConfirmedAt: verification.providerConfirmedAt,
      provider: verification.provider,
      proofPayload: verification.proofPayload,
      providerEventId: verification.providerEventId,
      providerTxHash: verification.providerTxHash,
    });

    return {
      verificationStatus: verification.verificationStatus,
      attempt: mapAttempt(updatedAttempt),
      mismatchReasonCode:
        verification.verificationStatus === "MISMATCH"
          ? verification.reasonCode ?? "KHQR_PROOF_MISMATCH"
          : null,
    };
  }

  async assertFinalizeEligibility(input: {
    actor: ActorScope;
    saleId: string;
    md5: string;
  }): Promise<void> {
    const scope = assertBranchScope(input.actor);
    const attempt = await this.repo.findAttemptByMd5({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      md5: input.md5,
    });
    if (!attempt || attempt.sale_id !== input.saleId) {
      throw new V0KhqrPaymentError(
        422,
        "SALE_FINALIZE_KHQR_CONFIRMATION_REQUIRED",
        "khqr payment confirmation required before finalize"
      );
    }

    if (attempt.status === "PAID_CONFIRMED") {
      return;
    }

    if (
      attempt.status === "PENDING_CONFIRMATION" ||
      attempt.last_verification_status === "MISMATCH"
    ) {
      throw new V0KhqrPaymentError(
        422,
        "SALE_FINALIZE_KHQR_PROOF_MISMATCH",
        "khqr proof mismatches expected sale payment details"
      );
    }

    throw new V0KhqrPaymentError(
      422,
      "SALE_FINALIZE_KHQR_CONFIRMATION_REQUIRED",
      "khqr payment confirmation required before finalize"
    );
  }

  async reconcileAttemptById(input: {
    attemptId: string;
  }): Promise<V0KhqrReconcileResult> {
    const lockedAttempt = await this.repo.lockAttemptByIdForUpdate({
      attemptId: input.attemptId,
    });
    if (!lockedAttempt) {
      return {
        status: "NOT_FOUND",
        attemptId: null,
        verificationStatus: null,
        reasonCode: null,
      };
    }

    if (isTerminalAttemptStatus(lockedAttempt.status)) {
      return {
        status: "SKIPPED_TERMINAL",
        attemptId: lockedAttempt.id,
        verificationStatus: null,
        reasonCode: null,
      };
    }

    const now = new Date();
    const syntheticExpired = lockedAttempt.expires_at && lockedAttempt.expires_at <= now;

    const verification = syntheticExpired
      ? {
          provider: resolveDefaultKhqrProviderName(),
          verificationStatus: "EXPIRED" as const,
          reasonCode: "KHQR_PAYMENT_EXPIRED",
          providerReference: lockedAttempt.provider_reference,
          providerEventId: null,
          providerTxHash: null,
          providerConfirmedAmount: null,
          providerConfirmedCurrency: null,
          providerConfirmedToAccountId: null,
          providerConfirmedAt: null,
          proofPayload: {
            source: "scheduler",
            reason: "attempt_expired",
            attemptId: lockedAttempt.id,
            md5: lockedAttempt.md5,
          } satisfies Record<string, unknown>,
        }
      : await this.provider.verifyByMd5({
          tenantId: lockedAttempt.tenant_id,
          branchId: lockedAttempt.branch_id,
          md5: lockedAttempt.md5,
          expectedAmount: lockedAttempt.expected_amount,
          expectedCurrency: lockedAttempt.expected_currency,
          expectedToAccountId: lockedAttempt.expected_to_account_id,
        });

    const reasonCode =
      verification.reasonCode ?? defaultReasonCode(verification.verificationStatus);
    await this.persistVerificationOutcome({
      attempt: lockedAttempt,
      verificationStatus: verification.verificationStatus,
      reasonCode,
      providerReference: verification.providerReference,
      providerConfirmedAmount: verification.providerConfirmedAmount,
      providerConfirmedCurrency: verification.providerConfirmedCurrency,
      providerConfirmedToAccountId: verification.providerConfirmedToAccountId,
      providerConfirmedAt: verification.providerConfirmedAt,
      provider: verification.provider,
      proofPayload: verification.proofPayload,
      providerEventId: verification.providerEventId,
      providerTxHash: verification.providerTxHash,
    });

    return {
      status: "APPLIED",
      attemptId: lockedAttempt.id,
      verificationStatus: verification.verificationStatus,
      reasonCode,
    };
  }

  async ingestWebhookEvent(input: {
    event: V0KhqrWebhookEvent;
  }): Promise<V0KhqrWebhookIngestResult> {
    const eventId = normalizeOptionalString(input.event.providerEventId);
    if (eventId) {
      const existingEvidence = await this.repo.findConfirmationEvidenceByProviderEvent({
        tenantId: input.event.tenantId,
        branchId: input.event.branchId,
        provider: input.event.provider,
        providerEventId: eventId,
      });
      if (existingEvidence) {
        const existingAttempt = await this.repo.findAttemptById({
          tenantId: input.event.tenantId,
          branchId: input.event.branchId,
          attemptId: existingEvidence.attempt_id,
        });
        return {
          status: "DUPLICATE",
          verificationStatus: existingEvidence.verification_status,
          mismatchReasonCode:
            existingEvidence.verification_status === "MISMATCH"
              ? existingEvidence.reason_code ?? "KHQR_PROOF_MISMATCH"
              : null,
          attempt: existingAttempt ? mapAttempt(existingAttempt) : null,
          providerEventId: existingEvidence.provider_event_id,
        };
      }
    }

    const lockedAttempt = await this.repo.lockAttemptByMd5ForUpdate({
      tenantId: input.event.tenantId,
      branchId: input.event.branchId,
      md5: input.event.md5,
    });
    if (!lockedAttempt) {
      return {
        status: "IGNORED",
        verificationStatus: null,
        mismatchReasonCode: null,
        attempt: null,
        providerEventId: eventId,
      };
    }

    const webhookVerification = resolveWebhookVerificationOutcome(lockedAttempt, input.event);
    const verifiedAt = new Date();
    const updatedAttempt = await this.repo.recordVerificationOutcome({
      tenantId: input.event.tenantId,
      branchId: input.event.branchId,
      attemptId: lockedAttempt.id,
      verificationStatus: webhookVerification.verificationStatus,
      reasonCode: webhookVerification.reasonCode,
      verifiedAt,
      providerReference: input.event.providerReference,
      providerConfirmedAmount: input.event.providerConfirmedAmount,
      providerConfirmedCurrency: input.event.providerConfirmedCurrency,
      providerConfirmedToAccountId: input.event.providerConfirmedToAccountId,
      providerConfirmedAt: input.event.occurredAt,
    });
    if (!updatedAttempt) {
      throw new V0KhqrPaymentError(404, "KHQR_ATTEMPT_NOT_FOUND", "khqr attempt not found");
    }

    const evidenceInserted = await this.repo.insertConfirmationEvidenceIfAbsent({
      tenantId: input.event.tenantId,
      branchId: input.event.branchId,
      attemptId: lockedAttempt.id,
      provider: input.event.provider,
      verificationStatus: webhookVerification.verificationStatus,
      reasonCode: webhookVerification.reasonCode,
      proofPayload: input.event.proofPayload,
      providerEventId: eventId,
      providerTxHash: input.event.providerTxHash,
      providerConfirmedAmount: input.event.providerConfirmedAmount,
      providerConfirmedCurrency: input.event.providerConfirmedCurrency,
      providerConfirmedToAccountId: input.event.providerConfirmedToAccountId,
      occurredAt: input.event.occurredAt,
    });
    if (!evidenceInserted.inserted) {
      return {
        status: "DUPLICATE",
        verificationStatus: webhookVerification.verificationStatus,
        mismatchReasonCode:
          webhookVerification.verificationStatus === "MISMATCH"
            ? webhookVerification.reasonCode ?? "KHQR_PROOF_MISMATCH"
            : null,
        attempt: mapAttempt(updatedAttempt),
        providerEventId: eventId,
      };
    }

    return {
      status: "APPLIED",
      verificationStatus: webhookVerification.verificationStatus,
      mismatchReasonCode:
        webhookVerification.verificationStatus === "MISMATCH"
          ? webhookVerification.reasonCode ?? "KHQR_PROOF_MISMATCH"
          : null,
      attempt: mapAttempt(updatedAttempt),
      providerEventId: eventId,
    };
  }

  private async persistVerificationOutcome(input: {
    attempt: V0KhqrPaymentAttemptRow;
    verificationStatus: V0KhqrVerificationStatus;
    reasonCode: string | null;
    providerReference: string | null;
    providerConfirmedAmount: number | null;
    providerConfirmedCurrency: V0KhqrCurrency | null;
    providerConfirmedToAccountId: string | null;
    providerConfirmedAt: Date | null;
    provider: "BAKONG" | "STUB";
    proofPayload: Record<string, unknown> | null;
    providerEventId: string | null;
    providerTxHash: string | null;
  }): Promise<V0KhqrPaymentAttemptRow> {
    const verifiedAt = new Date();
    const updatedAttempt = await this.repo.recordVerificationOutcome({
      tenantId: input.attempt.tenant_id,
      branchId: input.attempt.branch_id,
      attemptId: input.attempt.id,
      verificationStatus: input.verificationStatus,
      reasonCode: input.reasonCode,
      verifiedAt,
      providerReference: input.providerReference,
      providerConfirmedAmount: input.providerConfirmedAmount,
      providerConfirmedCurrency: input.providerConfirmedCurrency,
      providerConfirmedToAccountId: input.providerConfirmedToAccountId,
      providerConfirmedAt: input.providerConfirmedAt,
    });
    if (!updatedAttempt) {
      throw new V0KhqrPaymentError(404, "KHQR_ATTEMPT_NOT_FOUND", "khqr attempt not found");
    }

    await this.repo.insertConfirmationEvidence({
      tenantId: input.attempt.tenant_id,
      branchId: input.attempt.branch_id,
      attemptId: input.attempt.id,
      provider: input.provider,
      verificationStatus: input.verificationStatus,
      reasonCode: input.reasonCode,
      proofPayload: input.proofPayload,
      providerEventId: input.providerEventId,
      providerTxHash: input.providerTxHash,
      providerConfirmedAmount: input.providerConfirmedAmount,
      providerConfirmedCurrency: input.providerConfirmedCurrency,
      providerConfirmedToAccountId: input.providerConfirmedToAccountId,
      occurredAt: input.providerConfirmedAt ?? verifiedAt,
    });

    return updatedAttempt;
  }
}

export type V0KhqrPaymentAttemptView = {
  attemptId: string;
  saleId: string;
  md5: string;
  status: string;
  amount: number;
  currency: V0KhqrCurrency;
  toAccountId: string;
  expiresAt: string | null;
  paidConfirmedAt: string | null;
  supersededByAttemptId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type V0KhqrWebhookIngestResult = {
  status: "APPLIED" | "DUPLICATE" | "IGNORED";
  verificationStatus: V0KhqrVerificationStatus | null;
  mismatchReasonCode: string | null;
  attempt: V0KhqrPaymentAttemptView | null;
  providerEventId: string | null;
};

export type V0KhqrReconcileResult = {
  status: "APPLIED" | "SKIPPED_TERMINAL" | "NOT_FOUND";
  attemptId: string | null;
  verificationStatus: V0KhqrVerificationStatus | null;
  reasonCode: string | null;
};

function mapAttempt(row: V0KhqrPaymentAttemptRow): V0KhqrPaymentAttemptView {
  return {
    attemptId: row.id,
    saleId: row.sale_id,
    md5: row.md5,
    status: row.status,
    amount: row.expected_amount,
    currency: row.expected_currency,
    toAccountId: row.expected_to_account_id,
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    paidConfirmedAt: row.paid_confirmed_at ? row.paid_confirmed_at.toISOString() : null,
    supersededByAttemptId: row.superseded_by_attempt_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function assertBranchScope(actor: ActorScope): {
  accountId: string;
  tenantId: string;
  branchId: string;
} {
  const accountId = normalizeOptionalString(actor.accountId);
  if (!accountId) {
    throw new V0KhqrPaymentError(
      401,
      "INVALID_ACCESS_TOKEN",
      "authentication required"
    );
  }
  const tenantId = normalizeOptionalString(actor.tenantId);
  if (!tenantId) {
    throw new V0KhqrPaymentError(
      403,
      "TENANT_CONTEXT_REQUIRED",
      "tenant context required"
    );
  }
  const branchId = normalizeOptionalString(actor.branchId);
  if (!branchId) {
    throw new V0KhqrPaymentError(
      403,
      "BRANCH_CONTEXT_REQUIRED",
      "branch context required"
    );
  }
  return { accountId, tenantId, branchId };
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function defaultReasonCode(status: V0KhqrVerificationStatus): string | null {
  if (status === "UNPAID") {
    return "KHQR_PAYMENT_NOT_CONFIRMED";
  }
  if (status === "MISMATCH") {
    return "KHQR_PROOF_MISMATCH";
  }
  if (status === "EXPIRED") {
    return "KHQR_PAYMENT_EXPIRED";
  }
  if (status === "NOT_FOUND") {
    return "KHQR_PAYMENT_NOT_FOUND";
  }
  return null;
}

function isTerminalAttemptStatus(status: string): boolean {
  return status === "PAID_CONFIRMED" || status === "SUPERSEDED" || status === "EXPIRED";
}

function resolveDefaultKhqrProviderName(): "BAKONG" | "STUB" {
  const providerName = String(process.env.V0_KHQR_PROVIDER ?? "stub")
    .trim()
    .toLowerCase();
  return providerName === "stub" ? "STUB" : "BAKONG";
}

function resolveWebhookVerificationOutcome(
  attempt: V0KhqrPaymentAttemptRow,
  event: V0KhqrWebhookEvent
): {
  verificationStatus: V0KhqrVerificationStatus;
  reasonCode: string | null;
} {
  if (event.verificationStatus !== "CONFIRMED") {
    return {
      verificationStatus: event.verificationStatus,
      reasonCode: defaultReasonCode(event.verificationStatus),
    };
  }

  if (
    event.providerConfirmedAmount === null ||
    event.providerConfirmedCurrency === null ||
    event.providerConfirmedToAccountId === null
  ) {
    return {
      verificationStatus: "MISMATCH",
      reasonCode: "KHQR_WEBHOOK_PROOF_INCOMPLETE",
    };
  }

  const amountMatches = Number(event.providerConfirmedAmount) === Number(attempt.expected_amount);
  const currencyMatches = event.providerConfirmedCurrency === attempt.expected_currency;
  const receiverMatches =
    normalizeOptionalString(event.providerConfirmedToAccountId) ===
    normalizeOptionalString(attempt.expected_to_account_id);

  if (amountMatches && currencyMatches && receiverMatches) {
    return { verificationStatus: "CONFIRMED", reasonCode: null };
  }
  return { verificationStatus: "MISMATCH", reasonCode: "KHQR_PROOF_MISMATCH" };
}
