import { V0OrgAccountError, type OrgActorContext } from "../../common/error.js";
import type { FirstBranchPaymentVerifier } from "./payment-verifier.js";
import { V0BranchRepository } from "../infra/repository.js";

export class V0BranchService {
  constructor(
    private readonly repo: V0BranchRepository,
    private readonly paymentVerifier: FirstBranchPaymentVerifier
  ) {}

  async listAccessibleBranches(input: { actor: OrgActorContext }) {
    const scope = assertTenantContext(input.actor);
    const branches = await this.repo.listAccessibleBranches({
      accountId: scope.accountId,
      tenantId: scope.tenantId,
    });

    return branches.map((branch) => ({
      branchId: branch.id,
      tenantId: branch.tenant_id,
      branchName: branch.name,
      branchAddress: branch.address,
      contactNumber: branch.contact_phone,
      status: branch.status,
    }));
  }

  async getCurrentBranchProfile(input: { actor: OrgActorContext }) {
    const scope = assertBranchContext(input.actor);
    const hasAccess = await this.repo.hasActiveBranchAssignment({
      accountId: scope.accountId,
      tenantId: scope.tenantId,
      branchId: scope.branchId,
    });
    if (!hasAccess) {
      throw new V0OrgAccountError(403, "no active branch assignment for branch");
    }

    const branch = await this.repo.findBranchProfile({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
    });
    if (!branch) {
      throw new V0OrgAccountError(404, "branch not found");
    }

    return {
      branchId: branch.id,
      tenantId: branch.tenant_id,
      branchName: branch.name,
      branchAddress: branch.address,
      contactNumber: branch.contact_phone,
      status: branch.status,
    };
  }

  async initiateFirstBranchActivation(input: {
    actor: OrgActorContext;
    branchName: string;
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
    const scope = assertTenantContext(input.actor);
    const branchName = String(input.branchName ?? "").trim();
    if (!branchName) {
      throw new V0OrgAccountError(422, "branchName is required");
    }

    await this.repo.lockTenantForFirstBranchActivation(scope.tenantId);
    const branchCount = await this.repo.countBranchesByTenant(scope.tenantId);
    if (branchCount > 0) {
      throw new V0OrgAccountError(
        409,
        "tenant already has at least one branch",
        "TENANT_ALREADY_HAS_BRANCH"
      );
    }

    const existingDraft = await this.repo.findPendingFirstBranchActivationDraft(scope.tenantId);
    if (existingDraft) {
      return mapPendingDraft(existingDraft, false);
    }

    const createdDraft = await this.repo.createFirstBranchActivationDraftWithInvoice({
      tenantId: scope.tenantId,
      requestedByAccountId: scope.accountId,
      branchDisplayName: branchName,
      totalAmountUsd: resolveFirstBranchActivationAmountUsd(),
    });

    return mapPendingDraft(createdDraft, true);
  }

  async confirmFirstBranchActivation(input: {
    actor: OrgActorContext;
    draftId: string;
    paymentToken: string;
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
    const scope = assertTenantContext(input.actor);
    const draftId = String(input.draftId ?? "").trim();
    const paymentToken = String(input.paymentToken ?? "").trim();
    if (!draftId) {
      throw new V0OrgAccountError(422, "draftId is required");
    }
    if (!paymentToken) {
      throw new V0OrgAccountError(422, "paymentToken is required");
    }

    await this.repo.lockTenantForFirstBranchActivation(scope.tenantId);
    const activationDraft = await this.repo.findFirstBranchActivationDraftById({
      tenantId: scope.tenantId,
      draftId,
      forUpdate: true,
    });
    if (!activationDraft) {
      throw new V0OrgAccountError(404, "activation draft not found", "DRAFT_NOT_FOUND");
    }

    if (activationDraft.draft_status === "ACTIVATED") {
      const activatedBranchId = activationDraft.activated_branch_id;
      if (!activatedBranchId) {
        throw new V0OrgAccountError(
          500,
          "activation draft is activated without branch reference"
        );
      }
      const branch = await this.repo.findBranchProfile({
        tenantId: scope.tenantId,
        branchId: activatedBranchId,
      });
      if (!branch) {
        throw new V0OrgAccountError(500, "activated branch not found");
      }

      return {
        draftId: activationDraft.draft_id,
        branchId: branch.id,
        tenantId: branch.tenant_id,
        branchName: branch.name,
        status: branch.status,
        invoiceId: activationDraft.invoice_id,
        paymentConfirmationRef: activationDraft.payment_confirmation_ref,
        created: false,
      };
    }

    if (activationDraft.draft_status !== "PENDING_PAYMENT") {
      throw new V0OrgAccountError(
        409,
        "activation draft is not pending payment",
        "DRAFT_NOT_PENDING_PAYMENT"
      );
    }
    if (!["ISSUED", "PAID"].includes(activationDraft.invoice_status)) {
      throw new V0OrgAccountError(
        409,
        "activation draft invoice is not payable",
        "INVOICE_NOT_PAYABLE"
      );
    }

    const payment = await this.paymentVerifier.verify({
      tenantId: scope.tenantId,
      requesterAccountId: scope.accountId,
      paymentToken,
    });
    if (!payment.confirmed) {
      throw new V0OrgAccountError(
        402,
        "payment is not confirmed for first branch activation",
        payment.reasonCode ?? "PAYMENT_NOT_CONFIRMED"
      );
    }

    const branchCount = await this.repo.countBranchesByTenant(scope.tenantId);
    if (branchCount > 0) {
      throw new V0OrgAccountError(
        409,
        "tenant already has at least one branch",
        "TENANT_ALREADY_HAS_BRANCH"
      );
    }

    const branch = await this.repo.createActiveBranch({
      tenantId: scope.tenantId,
      branchName: activationDraft.branch_display_name,
    });
    await this.repo.markInvoicePaid(activationDraft.invoice_id);
    await this.repo.markDraftActivated({
      draftId: activationDraft.draft_id,
      branchId: branch.id,
      paymentConfirmationRef: payment.confirmationReference ?? null,
    });
    await this.repo.seedDefaultBranchEntitlements({
      tenantId: scope.tenantId,
      branchId: branch.id,
    });

    return {
      draftId: activationDraft.draft_id,
      branchId: branch.id,
      tenantId: branch.tenant_id,
      branchName: branch.name,
      status: branch.status,
      invoiceId: activationDraft.invoice_id,
      paymentConfirmationRef: payment.confirmationReference ?? null,
      created: true,
    };
  }
}

function mapPendingDraft(
  draft: {
    draft_id: string;
    tenant_id: string;
    branch_display_name: string;
    draft_status: "PENDING_PAYMENT" | "ACTIVATED" | "CANCELLED";
    invoice_id: string;
    invoice_status: "ISSUED" | "PAID" | "VOID" | "FAILED";
    invoice_currency: "USD" | string;
    invoice_total_amount_usd: string;
    invoice_issued_at: Date;
    invoice_paid_at: Date | null;
  },
  created: boolean
): {
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
} {
  if (draft.draft_status !== "PENDING_PAYMENT") {
    throw new V0OrgAccountError(500, "pending activation draft has invalid status");
  }
  if (draft.invoice_status !== "ISSUED") {
    throw new V0OrgAccountError(500, "pending activation draft invoice must be ISSUED");
  }
  if (draft.invoice_currency !== "USD") {
    throw new V0OrgAccountError(500, "unsupported invoice currency");
  }

  return {
    draftId: draft.draft_id,
    tenantId: draft.tenant_id,
    branchName: draft.branch_display_name,
    draftStatus: draft.draft_status,
    invoice: {
      invoiceId: draft.invoice_id,
      status: draft.invoice_status,
      currency: draft.invoice_currency,
      totalAmountUsd: draft.invoice_total_amount_usd,
      issuedAt: draft.invoice_issued_at.toISOString(),
      paidAt: draft.invoice_paid_at ? draft.invoice_paid_at.toISOString() : null,
    },
    created,
  };
}

function resolveFirstBranchActivationAmountUsd(): string {
  const raw = String(process.env.V0_FIRST_BRANCH_ACTIVATION_FEE_USD ?? "5.00").trim();
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new V0OrgAccountError(
      500,
      "invalid V0_FIRST_BRANCH_ACTIVATION_FEE_USD configuration"
    );
  }
  return parsed.toFixed(2);
}

function assertTenantContext(actor: OrgActorContext): {
  accountId: string;
  tenantId: string;
} {
  const accountId = String(actor.accountId ?? "").trim();
  const tenantId = String(actor.tenantId ?? "").trim();
  if (!accountId) {
    throw new V0OrgAccountError(401, "authentication required");
  }
  if (!tenantId) {
    throw new V0OrgAccountError(403, "tenant context required");
  }
  return { accountId, tenantId };
}

function assertBranchContext(actor: OrgActorContext): {
  accountId: string;
  tenantId: string;
  branchId: string;
} {
  const base = assertTenantContext(actor);
  const branchId = String(actor.branchId ?? "").trim();
  if (!branchId) {
    throw new V0OrgAccountError(403, "branch context required");
  }
  return {
    ...base,
    branchId,
  };
}
