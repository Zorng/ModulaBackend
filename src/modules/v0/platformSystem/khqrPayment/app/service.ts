import type { V0AuthRequest } from "../../../auth/api/middleware.js";
import type {
  V0KhqrCurrency,
  V0KhqrPaymentAttemptRow,
  V0PaymentIntentRow,
  V0SaleType,
  V0SaleKhqrLineSnapshotInput,
  V0SaleKhqrSnapshotRow,
  V0KhqrVerificationStatus,
} from "../infra/repository.js";
import { V0KhqrPaymentRepository } from "../infra/repository.js";
import type {
  V0KhqrGeneratedPaymentRequest,
  V0KhqrPaymentProvider,
  V0KhqrWebhookEvent,
} from "./payment-provider.js";

type ActorScope = NonNullable<V0AuthRequest["v0Auth"]>;

type V0CheckoutIntentLineSnapshot = {
  menuItemId: string;
  menuItemNameSnapshot: string;
  unitPrice: number;
  quantity: number;
  lineSubtotal: number;
  lineDiscountAmount: number;
  lineTotalAmount: number;
  modifierSnapshot: unknown;
  note: string | null;
};

type V0CheckoutIntentTotalsSnapshot = {
  subtotalUsd: number;
  subtotalKhr: number;
  discountUsd: number;
  discountKhr: number;
  vatUsd: number;
  vatKhr: number;
  grandTotalUsd: number;
  grandTotalKhr: number;
  paidAmountUsd: number;
};

type V0CheckoutIntentPricingSnapshot = {
  saleFxRateKhrPerUsd: number;
  saleKhrRoundingEnabled: boolean;
  saleKhrRoundingMode: "NEAREST" | "UP" | "DOWN";
  saleKhrRoundingGranularity: 100 | 1000;
};

type V0CheckoutIntentMetadataSnapshot = {
  saleType: V0SaleType;
};

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
    expiresAt: Date | null;
  }): Promise<{ created: boolean; attempt: V0KhqrPaymentAttemptView }> {
    const scope = assertBranchScope(input.actor);
    const receiver = await this.resolveBranchKhqrReceiver(scope);
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

    const paymentIntent = await this.repo.ensurePaymentIntentForSale({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      saleId: input.saleId,
      tenderAmount: input.amount,
      tenderCurrency: input.currency,
      expectedToAccountId: receiver.toAccountId,
      expiresAt: input.expiresAt,
      createdByAccountId: scope.accountId,
    });

    const created = await this.repo.createAttempt({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      paymentIntentId: paymentIntent.id,
      saleId: input.saleId,
      md5: input.md5,
      expectedAmount: input.amount,
      expectedCurrency: input.currency,
      expectedToAccountId: receiver.toAccountId,
      expiresAt: input.expiresAt,
      createdByAccountId: scope.accountId,
    });

    await this.repo.markOtherActiveAttemptsAsSuperseded({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      paymentIntentId: paymentIntent.id,
      supersededByAttemptId: created.id,
    });
    await this.repo.setPaymentIntentActiveAttempt({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      paymentIntentId: paymentIntent.id,
      activeAttemptId: created.id,
    });

    return {
      created: true,
      attempt: mapAttempt(created),
    };
  }

  async generateForSale(input: {
    actor: ActorScope;
    saleId: string;
    expiresInSeconds: number | null;
  }): Promise<V0KhqrGenerateResult> {
    const scope = assertBranchScope(input.actor);
    const sale = await this.repo.lockSaleForKhqrGeneration({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      saleId: input.saleId,
    });
    if (!sale) {
      throw new V0KhqrPaymentError(404, "KHQR_SALE_NOT_FOUND", "sale not found");
    }
    if (sale.payment_method !== "KHQR") {
      throw new V0KhqrPaymentError(
        422,
        "KHQR_SALE_PAYMENT_METHOD_INVALID",
        "sale payment method must be KHQR"
      );
    }
    if (sale.status !== "PENDING") {
      throw new V0KhqrPaymentError(
        422,
        "KHQR_SALE_STATUS_INVALID",
        "sale is not pending and cannot generate khqr"
      );
    }
    const hasOpenSession = await this.repo.hasOpenCashSession({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
    });
    if (!hasOpenSession) {
      throw new V0KhqrPaymentError(
        422,
        "KHQR_GENERATE_REQUIRES_OPEN_CASH_SESSION",
        "open cash session required to generate khqr"
      );
    }

    const receiver = await this.resolveBranchKhqrReceiver(scope);
    const expiresAt = resolveAttemptExpiry(input.expiresInSeconds);
    const generated = await this.provider.createPaymentRequest({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      saleId: sale.id,
      amount: sale.tender_amount,
      currency: sale.tender_currency,
      toAccountId: receiver.toAccountId,
      receiverName: receiver.receiverName,
      expiresAt,
    });

    const attemptResult = await this.registerAttempt({
      actor: input.actor,
      saleId: sale.id,
      md5: generated.md5,
      amount: sale.tender_amount,
      currency: sale.tender_currency,
      expiresAt,
    });

    await this.repo.updateSaleKhqrReference({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      saleId: sale.id,
      md5: generated.md5,
      toAccountId: receiver.toAccountId,
      khqrHash: generated.payloadHash,
    });

    return {
      attempt: attemptResult.attempt,
      paymentRequest: mapGeneratedRequest({
        generated,
        amount: sale.tender_amount,
        currency: sale.tender_currency,
        toAccountId: receiver.toAccountId,
        receiverName: receiver.receiverName,
        expiresAt,
      }),
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

  async initiateCheckoutIntent(input: {
    actor: ActorScope;
    tenderAmount: number;
    tenderCurrency: V0KhqrCurrency;
    expiresInSeconds: number | null;
    checkoutLinesSnapshot: unknown;
    checkoutTotalsSnapshot: unknown;
    pricingSnapshot: unknown;
    metadataSnapshot: unknown;
  }): Promise<{
    intent: V0KhqrPaymentIntentView;
    attempt: V0KhqrPaymentAttemptView;
    paymentRequest: V0KhqrGenerateResult["paymentRequest"];
  }> {
    const scope = assertBranchScope(input.actor);
    const receiver = await this.resolveBranchKhqrReceiver(scope);
    const expiresAt = resolveAttemptExpiry(input.expiresInSeconds);

    const paymentIntent = await this.repo.createPaymentIntentForCheckout({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      paymentMethod: "KHQR",
      tenderCurrency: input.tenderCurrency,
      tenderAmount: input.tenderAmount,
      expectedToAccountId: receiver.toAccountId,
      expiresAt,
      checkoutLinesSnapshot: input.checkoutLinesSnapshot,
      checkoutTotalsSnapshot: input.checkoutTotalsSnapshot,
      pricingSnapshot: input.pricingSnapshot,
      metadataSnapshot: input.metadataSnapshot,
      createdByAccountId: scope.accountId,
    });

    const generated = await this.provider.createPaymentRequest({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      saleId: paymentIntent.id,
      amount: input.tenderAmount,
      currency: input.tenderCurrency,
      toAccountId: receiver.toAccountId,
      receiverName: receiver.receiverName,
      expiresAt,
    });

    const attempt = await this.repo.createAttempt({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      paymentIntentId: paymentIntent.id,
      saleId: null,
      md5: generated.md5,
      expectedAmount: input.tenderAmount,
      expectedCurrency: input.tenderCurrency,
      expectedToAccountId: receiver.toAccountId,
      expiresAt,
      createdByAccountId: scope.accountId,
    });

    const updatedIntent = await this.repo.setPaymentIntentActiveAttempt({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      paymentIntentId: paymentIntent.id,
      activeAttemptId: attempt.id,
    });
    if (!updatedIntent) {
      throw new V0KhqrPaymentError(404, "PAYMENT_INTENT_NOT_FOUND", "payment intent not found");
    }

    return {
      intent: mapPaymentIntent(updatedIntent),
      attempt: mapAttempt(attempt),
      paymentRequest: mapGeneratedRequest({
        generated,
        amount: input.tenderAmount,
        currency: input.tenderCurrency,
        toAccountId: receiver.toAccountId,
        receiverName: receiver.receiverName,
        expiresAt,
      }),
    };
  }

  async getPaymentIntentById(input: {
    actor: ActorScope;
    paymentIntentId: string;
  }): Promise<V0KhqrPaymentIntentView> {
    const scope = assertBranchScope(input.actor);
    const found = await this.repo.findPaymentIntentById({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      paymentIntentId: input.paymentIntentId,
    });
    if (!found) {
      throw new V0KhqrPaymentError(404, "PAYMENT_INTENT_NOT_FOUND", "payment intent not found");
    }
    return mapPaymentIntent(found);
  }

  async cancelPaymentIntent(input: {
    actor: ActorScope;
    paymentIntentId: string;
    reasonCode: string | null;
  }): Promise<V0KhqrPaymentIntentView> {
    const scope = assertBranchScope(input.actor);
    const lockedIntent = await this.repo.lockPaymentIntentByIdForUpdate({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      paymentIntentId: input.paymentIntentId,
    });
    if (!lockedIntent) {
      throw new V0KhqrPaymentError(404, "PAYMENT_INTENT_NOT_FOUND", "payment intent not found");
    }
    if (lockedIntent.status === "FINALIZED") {
      throw new V0KhqrPaymentError(
        409,
        "PAYMENT_INTENT_ALREADY_FINALIZED",
        "payment intent is already finalized"
      );
    }
    if (lockedIntent.status === "PAID_CONFIRMED") {
      throw new V0KhqrPaymentError(
        409,
        "PAYMENT_INTENT_NOT_CANCELLABLE",
        "payment intent is already confirmed"
      );
    }

    const normalizedReasonCode =
      normalizeOptionalString(input.reasonCode) ?? "KHQR_INTENT_CANCELLED";
    const cancelledIntent =
      lockedIntent.status === "CANCELLED"
        ? lockedIntent
        : await this.repo.cancelPaymentIntent({
            tenantId: scope.tenantId,
            branchId: scope.branchId,
            paymentIntentId: lockedIntent.id,
            reasonCode: normalizedReasonCode,
          });
    if (!cancelledIntent) {
      throw new V0KhqrPaymentError(404, "PAYMENT_INTENT_NOT_FOUND", "payment intent not found");
    }

    await this.repo.markAttemptsCancelledForIntent({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      paymentIntentId: cancelledIntent.id,
      reasonCode: normalizedReasonCode,
    });

    return mapPaymentIntent(cancelledIntent);
  }

  async cancelAttempt(input: {
    actor: ActorScope;
    attemptId: string;
    reasonCode: string | null;
  }): Promise<{
    cancelled: boolean;
    attempt: V0KhqrPaymentAttemptView;
    paymentIntent: V0KhqrPaymentIntentView;
  }> {
    const scope = assertBranchScope(input.actor);
    const lockedAttempt = await this.repo.lockAttemptByIdForUpdate({
      attemptId: input.attemptId,
    });
    if (
      !lockedAttempt ||
      lockedAttempt.tenant_id !== scope.tenantId ||
      lockedAttempt.branch_id !== scope.branchId
    ) {
      throw new V0KhqrPaymentError(404, "KHQR_ATTEMPT_NOT_FOUND", "khqr attempt not found");
    }

    if (
      lockedAttempt.status === "PAID_CONFIRMED" ||
      lockedAttempt.status === "EXPIRED" ||
      lockedAttempt.status === "SUPERSEDED"
    ) {
      throw new V0KhqrPaymentError(
        409,
        "KHQR_ATTEMPT_NOT_CANCELLABLE",
        "khqr attempt is already terminal"
      );
    }

    const lockedIntent = await this.repo.lockPaymentIntentByIdForUpdate({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      paymentIntentId: lockedAttempt.payment_intent_id,
    });
    if (!lockedIntent) {
      throw new V0KhqrPaymentError(404, "PAYMENT_INTENT_NOT_FOUND", "payment intent not found");
    }
    if (lockedIntent.status === "FINALIZED") {
      throw new V0KhqrPaymentError(
        409,
        "PAYMENT_INTENT_ALREADY_FINALIZED",
        "payment intent is already finalized"
      );
    }
    if (lockedIntent.status === "PAID_CONFIRMED") {
      throw new V0KhqrPaymentError(
        409,
        "PAYMENT_INTENT_NOT_CANCELLABLE",
        "payment intent is already confirmed"
      );
    }

    const normalizedReasonCode =
      normalizeOptionalString(input.reasonCode) ?? "KHQR_ATTEMPT_CANCELLED";
    const cancelledIntent =
      lockedIntent.status === "CANCELLED"
        ? lockedIntent
        : await this.repo.cancelPaymentIntent({
            tenantId: scope.tenantId,
            branchId: scope.branchId,
            paymentIntentId: lockedIntent.id,
            reasonCode: normalizedReasonCode,
          });
    if (!cancelledIntent) {
      throw new V0KhqrPaymentError(404, "PAYMENT_INTENT_NOT_FOUND", "payment intent not found");
    }

    await this.repo.markAttemptsCancelledForIntent({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      paymentIntentId: cancelledIntent.id,
      reasonCode: normalizedReasonCode,
    });

    const cancelledAttempt = await this.repo.findAttemptById({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      attemptId: lockedAttempt.id,
    });
    if (!cancelledAttempt) {
      throw new V0KhqrPaymentError(404, "KHQR_ATTEMPT_NOT_FOUND", "khqr attempt not found");
    }

    return {
      cancelled: true,
      attempt: mapAttempt(cancelledAttempt),
      paymentIntent: mapPaymentIntent(cancelledIntent),
    };
  }

  async confirmByMd5(input: {
    actor: ActorScope;
    md5: string;
  }): Promise<{
    verificationStatus: V0KhqrVerificationStatus;
    attempt: V0KhqrPaymentAttemptView;
    sale: V0KhqrFinalizedSaleView | null;
    saleFinalized: boolean;
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
    const saleFinalize = await this.finalizeSaleFromConfirmedAttempt({
      attempt: updatedAttempt,
      finalizedByAccountId: scope.accountId,
    });

    return {
      verificationStatus: verification.verificationStatus,
      attempt: mapAttempt(updatedAttempt),
      sale: saleFinalize.sale ? mapFinalizedSale(saleFinalize.sale) : null,
      saleFinalized: saleFinalize.newlyFinalized,
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

    const strictScopedAttempt = await this.repo.lockAttemptByMd5ForUpdate({
      tenantId: input.event.tenantId,
      branchId: input.event.branchId,
      md5: input.event.md5,
    });
    let lockedAttempt = strictScopedAttempt;
    if (!lockedAttempt) {
      const fallbackLookup = await this.repo.lockUniqueAttemptByMd5ForUpdate({
        md5: input.event.md5,
      });
      if (fallbackLookup.ambiguous) {
        return {
          status: "IGNORED",
          ignoredReason: "AMBIGUOUS_MD5",
          verificationStatus: null,
          mismatchReasonCode: null,
          attempt: null,
          sale: null,
          saleFinalized: false,
          providerEventId: eventId,
        };
      }
      lockedAttempt = fallbackLookup.attempt;
    }

    if (!lockedAttempt) {
      return {
        status: "IGNORED",
        ignoredReason: "NO_MATCH",
        verificationStatus: null,
        mismatchReasonCode: null,
        attempt: null,
        sale: null,
        saleFinalized: false,
        providerEventId: eventId,
      };
    }

    if (eventId) {
      const existingEvidence = await this.repo.findConfirmationEvidenceByProviderEvent({
        tenantId: lockedAttempt.tenant_id,
        branchId: lockedAttempt.branch_id,
        provider: input.event.provider,
        providerEventId: eventId,
      });
      if (existingEvidence) {
        const existingAttempt = await this.repo.findAttemptById({
          tenantId: lockedAttempt.tenant_id,
          branchId: lockedAttempt.branch_id,
          attemptId: existingEvidence.attempt_id,
        });
        return {
          status: "DUPLICATE",
          ignoredReason: null,
          verificationStatus: existingEvidence.verification_status,
          mismatchReasonCode:
            existingEvidence.verification_status === "MISMATCH"
              ? existingEvidence.reason_code ?? "KHQR_PROOF_MISMATCH"
              : null,
          attempt: existingAttempt ? mapAttempt(existingAttempt) : null,
          sale: null,
          saleFinalized: false,
          providerEventId: existingEvidence.provider_event_id,
        };
      }
    }

    const webhookVerification = resolveWebhookVerificationOutcome(lockedAttempt, input.event);
    const verifiedAt = new Date();
    const updatedAttempt = await this.repo.recordVerificationOutcome({
      tenantId: lockedAttempt.tenant_id,
      branchId: lockedAttempt.branch_id,
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

    if (updatedAttempt.status !== "SUPERSEDED") {
      await this.repo.recordPaymentIntentVerificationOutcome({
        tenantId: lockedAttempt.tenant_id,
        branchId: lockedAttempt.branch_id,
        paymentIntentId: lockedAttempt.payment_intent_id,
        verificationStatus: webhookVerification.verificationStatus,
        reasonCode: webhookVerification.reasonCode,
        providerConfirmedAt: input.event.occurredAt,
      });
    }
    const saleFinalize = await this.finalizeSaleFromConfirmedAttempt({
      attempt: updatedAttempt,
      finalizedByAccountId: null,
    });

    const evidenceInserted = await this.repo.insertConfirmationEvidenceIfAbsent({
      tenantId: lockedAttempt.tenant_id,
      branchId: lockedAttempt.branch_id,
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
        ignoredReason: null,
        verificationStatus: webhookVerification.verificationStatus,
        mismatchReasonCode:
          webhookVerification.verificationStatus === "MISMATCH"
            ? webhookVerification.reasonCode ?? "KHQR_PROOF_MISMATCH"
            : null,
        attempt: mapAttempt(updatedAttempt),
        sale: saleFinalize.sale ? mapFinalizedSale(saleFinalize.sale) : null,
        saleFinalized: false,
        providerEventId: eventId,
      };
    }

    return {
      status: "APPLIED",
      ignoredReason: null,
      verificationStatus: webhookVerification.verificationStatus,
      mismatchReasonCode:
        webhookVerification.verificationStatus === "MISMATCH"
          ? webhookVerification.reasonCode ?? "KHQR_PROOF_MISMATCH"
          : null,
      attempt: mapAttempt(updatedAttempt),
      sale: saleFinalize.sale ? mapFinalizedSale(saleFinalize.sale) : null,
      saleFinalized: saleFinalize.newlyFinalized,
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

    if (updatedAttempt.status !== "SUPERSEDED") {
      await this.repo.recordPaymentIntentVerificationOutcome({
        tenantId: input.attempt.tenant_id,
        branchId: input.attempt.branch_id,
        paymentIntentId: input.attempt.payment_intent_id,
        verificationStatus: input.verificationStatus,
        reasonCode: input.reasonCode,
        providerConfirmedAt: input.providerConfirmedAt,
      });
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

  private async finalizeSaleFromConfirmedAttempt(input: {
    attempt: V0KhqrPaymentAttemptRow;
    finalizedByAccountId: string | null;
  }): Promise<{
    sale: V0SaleKhqrSnapshotRow | null;
    newlyFinalized: boolean;
  }> {
    if (input.attempt.status !== "PAID_CONFIRMED") {
      return { sale: null, newlyFinalized: false };
    }

    const lockedIntent = await this.repo.lockPaymentIntentByIdForUpdate({
      tenantId: input.attempt.tenant_id,
      branchId: input.attempt.branch_id,
      paymentIntentId: input.attempt.payment_intent_id,
    });
    if (!lockedIntent) {
      return { sale: null, newlyFinalized: false };
    }
    if (lockedIntent.status === "CANCELLED") {
      return { sale: null, newlyFinalized: false };
    }

    const saleId = input.attempt.sale_id ?? lockedIntent.sale_id;
    if (!saleId) {
      const createdSale = await this.createFinalizedSaleFromIntent({
        intent: lockedIntent,
        attempt: input.attempt,
        finalizedByAccountId:
          input.finalizedByAccountId ?? input.attempt.created_by_account_id ?? null,
      });
      if (!createdSale) {
        return { sale: null, newlyFinalized: false };
      }
      return { sale: createdSale, newlyFinalized: true };
    }

    const lockedSale = await this.repo.lockSaleForKhqrGeneration({
      tenantId: input.attempt.tenant_id,
      branchId: input.attempt.branch_id,
      saleId,
    });
    if (!lockedSale) {
      return { sale: null, newlyFinalized: false };
    }

    if (lockedSale.status === "FINALIZED") {
      await this.repo.markPaymentIntentFinalized({
        tenantId: input.attempt.tenant_id,
        branchId: input.attempt.branch_id,
        paymentIntentId: input.attempt.payment_intent_id,
        saleId: lockedSale.id,
      });
      return { sale: lockedSale, newlyFinalized: false };
    }

    if (lockedSale.status === "VOIDED") {
      return { sale: lockedSale, newlyFinalized: false };
    }

    if (lockedSale.payment_method !== "KHQR") {
      throw new V0KhqrPaymentError(
        422,
        "KHQR_SALE_PAYMENT_METHOD_INVALID",
        "sale payment method must be KHQR"
      );
    }

    const finalizedSale = await this.repo.markSaleFinalizedFromKhqr({
      tenantId: input.attempt.tenant_id,
      branchId: input.attempt.branch_id,
      saleId: lockedSale.id,
      md5: input.attempt.md5,
      toAccountId: input.attempt.expected_to_account_id,
      khqrHash: input.attempt.provider_reference,
      khqrConfirmedAt: input.attempt.provider_confirmed_at ?? input.attempt.paid_confirmed_at,
      finalizedByAccountId:
        input.finalizedByAccountId ?? input.attempt.created_by_account_id ?? null,
    });
    if (!finalizedSale) {
      return { sale: null, newlyFinalized: false };
    }
    await this.repo.markPaymentIntentFinalized({
      tenantId: input.attempt.tenant_id,
      branchId: input.attempt.branch_id,
      paymentIntentId: input.attempt.payment_intent_id,
      saleId: finalizedSale.id,
    });
    await this.repo.assignSaleToIntentAttempts({
      tenantId: input.attempt.tenant_id,
      branchId: input.attempt.branch_id,
      paymentIntentId: input.attempt.payment_intent_id,
      saleId: finalizedSale.id,
    });
    return { sale: finalizedSale, newlyFinalized: true };
  }

  private async createFinalizedSaleFromIntent(input: {
    intent: V0PaymentIntentRow;
    attempt: V0KhqrPaymentAttemptRow;
    finalizedByAccountId: string | null;
  }): Promise<V0SaleKhqrSnapshotRow | null> {
    const lines = parseCheckoutIntentLinesSnapshot(input.intent.checkout_lines_snapshot);
    if (lines.length === 0) {
      throw new V0KhqrPaymentError(
        422,
        "PAYMENT_INTENT_NOT_FINALIZABLE",
        "payment intent has no checkout lines"
      );
    }
    const totals = parseCheckoutIntentTotalsSnapshot(
      input.intent.checkout_totals_snapshot,
      input.intent
    );
    const pricing = parseCheckoutIntentPricingSnapshot(input.intent.pricing_snapshot);
    const metadata = parseCheckoutIntentMetadataSnapshot(input.intent.metadata_snapshot);
    const openedByAccountId =
      normalizeOptionalString(input.intent.created_by_account_id)
      ?? normalizeOptionalString(input.attempt.created_by_account_id);
    if (!openedByAccountId) {
      throw new V0KhqrPaymentError(
        422,
        "PAYMENT_INTENT_NOT_FINALIZABLE",
        "payment intent is missing checkout creator context"
      );
    }
    const checkedOutByAccountId =
      normalizeOptionalString(input.finalizedByAccountId) ?? openedByAccountId;

    const order = await this.repo.createDirectCheckoutOrderTicket({
      tenantId: input.intent.tenant_id,
      branchId: input.intent.branch_id,
      openedByAccountId,
    });
    const orderLineIds: string[] = [];
    for (const line of lines) {
      const orderLine = await this.repo.createDirectCheckoutOrderTicketLine({
        tenantId: input.intent.tenant_id,
        branchId: input.intent.branch_id,
        orderTicketId: order.id,
        menuItemId: line.menuItemId,
        menuItemNameSnapshot: line.menuItemNameSnapshot,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        lineSubtotal: line.lineSubtotal,
        modifierSnapshot: line.modifierSnapshot,
        note: line.note,
      });
      orderLineIds.push(orderLine.id);
    }

    const createdSale = await this.repo.createPendingSaleForKhqrIntent({
      tenantId: input.intent.tenant_id,
      branchId: input.intent.branch_id,
      orderTicketId: order.id,
      saleType: metadata.saleType,
      tenderCurrency: input.intent.tender_currency,
      tenderAmount: input.intent.tender_amount,
      khqrMd5: input.attempt.md5,
      khqrToAccountId: input.attempt.expected_to_account_id,
      khqrHash: input.attempt.provider_reference,
      khqrConfirmedAt: input.attempt.provider_confirmed_at ?? input.attempt.paid_confirmed_at,
      subtotalUsd: totals.subtotalUsd,
      subtotalKhr: totals.subtotalKhr,
      discountUsd: totals.discountUsd,
      discountKhr: totals.discountKhr,
      vatUsd: totals.vatUsd,
      vatKhr: totals.vatKhr,
      grandTotalUsd: totals.grandTotalUsd,
      grandTotalKhr: totals.grandTotalKhr,
      saleFxRateKhrPerUsd: pricing.saleFxRateKhrPerUsd,
      saleKhrRoundingEnabled: pricing.saleKhrRoundingEnabled,
      saleKhrRoundingMode: pricing.saleKhrRoundingMode,
      saleKhrRoundingGranularity: pricing.saleKhrRoundingGranularity,
      paidAmount: totals.paidAmountUsd,
    });

    for (const [index, line] of lines.entries()) {
      await this.repo.createSaleLineForKhqrIntent({
        tenantId: input.intent.tenant_id,
        branchId: input.intent.branch_id,
        saleId: createdSale.id,
        orderTicketLineId: orderLineIds[index] ?? null,
        line,
      });
    }

    const orderCheckedOut = await this.repo.markDirectCheckoutOrderCheckedOut({
      tenantId: input.intent.tenant_id,
      branchId: input.intent.branch_id,
      orderTicketId: order.id,
      checkedOutByAccountId,
    });
    if (!orderCheckedOut) {
      throw new V0KhqrPaymentError(
        409,
        "PAYMENT_INTENT_NOT_FINALIZABLE",
        "direct checkout order could not be checked out"
      );
    }

    await this.repo.createDirectCheckoutFulfillmentBatch({
      tenantId: input.intent.tenant_id,
      branchId: input.intent.branch_id,
      orderTicketId: order.id,
      status: "PENDING",
      note: null,
      createdByAccountId: checkedOutByAccountId,
    });

    const finalizedSale = await this.repo.markSaleFinalizedFromKhqr({
      tenantId: input.intent.tenant_id,
      branchId: input.intent.branch_id,
      saleId: createdSale.id,
      md5: input.attempt.md5,
      toAccountId: input.attempt.expected_to_account_id,
      khqrHash: input.attempt.provider_reference,
      khqrConfirmedAt: input.attempt.provider_confirmed_at ?? input.attempt.paid_confirmed_at,
      finalizedByAccountId: input.finalizedByAccountId,
    });
    if (!finalizedSale) {
      return null;
    }
    await this.repo.markPaymentIntentFinalized({
      tenantId: input.intent.tenant_id,
      branchId: input.intent.branch_id,
      paymentIntentId: input.intent.id,
      saleId: finalizedSale.id,
    });
    await this.repo.assignSaleToIntentAttempts({
      tenantId: input.intent.tenant_id,
      branchId: input.intent.branch_id,
      paymentIntentId: input.intent.id,
      saleId: finalizedSale.id,
    });
    return finalizedSale;
  }

  private async resolveBranchKhqrReceiver(scope: {
    tenantId: string;
    branchId: string;
  }): Promise<{ toAccountId: string; receiverName: string | null }> {
    const row = await this.repo.findBranchKhqrReceiver({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
    });
    if (!row) {
      throw new V0KhqrPaymentError(404, "KHQR_BRANCH_NOT_FOUND", "branch not found");
    }
    const toAccountId = normalizeOptionalString(row.khqr_receiver_account_id);
    if (!toAccountId) {
      throw new V0KhqrPaymentError(
        422,
        "KHQR_BRANCH_RECEIVER_NOT_CONFIGURED",
        "khqr receiver account is not configured for this branch"
      );
    }
    return {
      toAccountId,
      receiverName: normalizeOptionalString(row.khqr_receiver_name),
    };
  }
}

export type V0KhqrPaymentAttemptView = {
  attemptId: string;
  paymentIntentId: string;
  saleId: string | null;
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

export type V0KhqrPaymentIntentView = {
  paymentIntentId: string;
  saleId: string | null;
  status: string;
  paymentMethod: "KHQR" | "CASH";
  tenderCurrency: V0KhqrCurrency;
  tenderAmount: number;
  expectedToAccountId: string | null;
  activeAttemptId: string | null;
  expiresAt: string | null;
  paidConfirmedAt: string | null;
  finalizedAt: string | null;
  cancelledAt: string | null;
  reasonCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type V0KhqrWebhookIngestResult = {
  status: "APPLIED" | "DUPLICATE" | "IGNORED";
  ignoredReason: "NO_MATCH" | "AMBIGUOUS_MD5" | null;
  verificationStatus: V0KhqrVerificationStatus | null;
  mismatchReasonCode: string | null;
  attempt: V0KhqrPaymentAttemptView | null;
  sale: V0KhqrFinalizedSaleView | null;
  saleFinalized: boolean;
  providerEventId: string | null;
};

export type V0KhqrReconcileResult = {
  status: "APPLIED" | "SKIPPED_TERMINAL" | "NOT_FOUND";
  attemptId: string | null;
  verificationStatus: V0KhqrVerificationStatus | null;
  reasonCode: string | null;
};

export type V0KhqrGenerateResult = {
  attempt: V0KhqrPaymentAttemptView;
  paymentRequest: {
    md5: string;
    payload: string;
    payloadFormat: "RAW_TEXT";
    payloadType: "DEEPLINK_URL" | "EMV_KHQR_STRING" | "TEXT";
    deepLinkUrl: string | null;
    amount: number;
    currency: V0KhqrCurrency;
    toAccountId: string;
    receiverName: string | null;
    expiresAt: string | null;
    provider: "BAKONG" | "STUB";
    providerReference: string | null;
  };
};

export type V0KhqrFinalizedSaleView = {
  saleId: string;
  orderId: string | null;
  status: "PENDING" | "FINALIZED" | "VOID_PENDING" | "VOIDED";
  saleType: V0SaleType;
  paymentMethod: "CASH" | "KHQR";
  tenderCurrency: V0KhqrCurrency;
  tenderAmount: number;
  paidAmount: number;
  grandTotalUsd: number;
  grandTotalKhr: number;
  khqrMd5: string | null;
  khqrToAccountId: string | null;
  khqrHash: string | null;
  khqrConfirmedAt: string | null;
  finalizedAt: string | null;
  finalizedByAccountId: string | null;
};

function mapAttempt(row: V0KhqrPaymentAttemptRow): V0KhqrPaymentAttemptView {
  return {
    attemptId: row.id,
    paymentIntentId: row.payment_intent_id,
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

function mapFinalizedSale(row: V0SaleKhqrSnapshotRow): V0KhqrFinalizedSaleView {
  return {
    saleId: row.id,
    orderId: row.order_ticket_id,
    status: row.status,
    saleType: row.sale_type,
    paymentMethod: row.payment_method,
    tenderCurrency: row.tender_currency,
    tenderAmount: row.tender_amount,
    paidAmount: row.paid_amount,
    grandTotalUsd: row.grand_total_usd,
    grandTotalKhr: row.grand_total_khr,
    khqrMd5: row.khqr_md5,
    khqrToAccountId: row.khqr_to_account_id,
    khqrHash: row.khqr_hash,
    khqrConfirmedAt: row.khqr_confirmed_at ? row.khqr_confirmed_at.toISOString() : null,
    finalizedAt: row.finalized_at ? row.finalized_at.toISOString() : null,
    finalizedByAccountId: row.finalized_by_account_id,
  };
}

function mapPaymentIntent(row: V0PaymentIntentRow): V0KhqrPaymentIntentView {
  return {
    paymentIntentId: row.id,
    saleId: row.sale_id,
    status: row.status,
    paymentMethod: row.payment_method,
    tenderCurrency: row.tender_currency,
    tenderAmount: row.tender_amount,
    expectedToAccountId: row.expected_to_account_id,
    activeAttemptId: row.active_attempt_id,
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    paidConfirmedAt: row.paid_confirmed_at ? row.paid_confirmed_at.toISOString() : null,
    finalizedAt: row.finalized_at ? row.finalized_at.toISOString() : null,
    cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : null,
    reasonCode: row.reason_code,
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
  return (
    status === "PAID_CONFIRMED" ||
    status === "SUPERSEDED" ||
    status === "EXPIRED" ||
    status === "CANCELLED"
  );
}

function resolveDefaultKhqrProviderName(): "BAKONG" | "STUB" {
  const providerName = String(process.env.V0_KHQR_PROVIDER ?? "stub")
    .trim()
    .toLowerCase();
  return providerName === "stub" ? "STUB" : "BAKONG";
}

function mapGeneratedRequest(input: {
  generated: V0KhqrGeneratedPaymentRequest;
  amount: number;
  currency: V0KhqrCurrency;
  toAccountId: string;
  receiverName: string | null;
  expiresAt: Date | null;
}): V0KhqrGenerateResult["paymentRequest"] {
  return {
    md5: input.generated.md5,
    payload: input.generated.payload,
    payloadFormat: input.generated.payloadFormat,
    payloadType: input.generated.payloadType,
    deepLinkUrl: input.generated.deepLinkUrl,
    amount: input.amount,
    currency: input.currency,
    toAccountId: input.toAccountId,
    receiverName: input.receiverName,
    expiresAt: input.expiresAt ? input.expiresAt.toISOString() : null,
    provider: input.generated.provider,
    providerReference: input.generated.providerReference,
  };
}

function parseCheckoutIntentLinesSnapshot(value: unknown): V0SaleKhqrLineSnapshotInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const lines: V0SaleKhqrLineSnapshotInput[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const menuItemId = normalizeOptionalString(record.menuItemId);
    const menuItemNameSnapshot = normalizeOptionalString(record.menuItemNameSnapshot);
    const unitPrice = toFiniteNumber(record.unitPrice);
    const quantity = toFiniteNumber(record.quantity);
    const lineSubtotal = toFiniteNumber(record.lineSubtotal);
    const lineDiscountAmount = toFiniteNumber(record.lineDiscountAmount ?? 0);
    const lineTotalAmount = toFiniteNumber(record.lineTotalAmount ?? lineSubtotal);
    if (
      !menuItemId ||
      !menuItemNameSnapshot ||
      unitPrice === null ||
      quantity === null ||
      lineSubtotal === null ||
      lineTotalAmount === null
    ) {
      continue;
    }
    lines.push({
      menuItemId,
      menuItemNameSnapshot,
      unitPrice,
      quantity,
      lineSubtotal,
      lineDiscountAmount: lineDiscountAmount ?? 0,
      lineTotalAmount,
      modifierSnapshot: record.modifierSnapshot ?? [],
      note: normalizeOptionalString(record.note),
    });
  }
  return lines;
}

function parseCheckoutIntentTotalsSnapshot(
  value: unknown,
  intent: V0PaymentIntentRow
): V0CheckoutIntentTotalsSnapshot {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const subtotalUsd = toFiniteNumber(record.subtotalUsd) ?? intent.tender_amount;
  const subtotalKhr = toFiniteNumber(record.subtotalKhr) ?? subtotalUsd * 4100;
  const discountUsd = toFiniteNumber(record.discountUsd) ?? 0;
  const discountKhr = toFiniteNumber(record.discountKhr) ?? 0;
  const vatUsd = toFiniteNumber(record.vatUsd) ?? 0;
  const vatKhr = toFiniteNumber(record.vatKhr) ?? 0;
  const grandTotalUsd = toFiniteNumber(record.grandTotalUsd) ?? intent.tender_amount;
  const grandTotalKhr = toFiniteNumber(record.grandTotalKhr) ?? grandTotalUsd * 4100;
  const paidAmountUsd = toFiniteNumber(record.paidAmountUsd) ?? grandTotalUsd;

  return {
    subtotalUsd,
    subtotalKhr,
    discountUsd,
    discountKhr,
    vatUsd,
    vatKhr,
    grandTotalUsd,
    grandTotalKhr,
    paidAmountUsd,
  };
}

function parseCheckoutIntentPricingSnapshot(value: unknown): V0CheckoutIntentPricingSnapshot {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const saleFxRateKhrPerUsd = toFiniteNumber(record.saleFxRateKhrPerUsd) ?? 4100;
  const saleKhrRoundingEnabled =
    typeof record.saleKhrRoundingEnabled === "boolean"
      ? record.saleKhrRoundingEnabled
      : true;

  const rawMode = normalizeOptionalString(record.saleKhrRoundingMode)?.toUpperCase();
  const saleKhrRoundingMode =
    rawMode === "UP" || rawMode === "DOWN" || rawMode === "NEAREST"
      ? rawMode
      : "NEAREST";

  const rawGranularity = Number(record.saleKhrRoundingGranularity);
  const saleKhrRoundingGranularity = rawGranularity === 1000 ? 1000 : 100;

  return {
    saleFxRateKhrPerUsd,
    saleKhrRoundingEnabled,
    saleKhrRoundingMode,
    saleKhrRoundingGranularity,
  };
}

function parseCheckoutIntentMetadataSnapshot(value: unknown): V0CheckoutIntentMetadataSnapshot {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return {
    saleType: parseSaleType(record.saleType),
  };
}

function parseSaleType(value: unknown): V0SaleType {
  const raw = normalizeOptionalString(value);
  if (!raw) {
    return "DINE_IN";
  }
  const normalized = raw.toUpperCase().replaceAll("-", "_");
  if (normalized === "DINE_IN") {
    return "DINE_IN";
  }
  if (normalized === "TAKEAWAY" || normalized === "TAKE_AWAY") {
    return "TAKEAWAY";
  }
  if (normalized === "DELIVERY") {
    return "DELIVERY";
  }
  return "DINE_IN";
}

function toFiniteNumber(value: unknown): number | null {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.round(numeric * 100) / 100;
}

function resolveAttemptExpiry(expiresInSeconds: number | null): Date | null {
  const defaultTtlSeconds = clamp(
    Number.parseInt(String(process.env.V0_KHQR_ATTEMPT_TTL_SECONDS ?? "300"), 10),
    30,
    60 * 60
  );
  const ttlSeconds =
    expiresInSeconds === null
      ? defaultTtlSeconds
      : clamp(Math.floor(expiresInSeconds), 30, 60 * 60);
  return new Date(Date.now() + ttlSeconds * 1000);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
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
