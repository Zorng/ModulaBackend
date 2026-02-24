import { V0OrgAccountError, type OrgActorContext } from "../../common/error.js";
import type { FirstBranchPaymentVerifier } from "./payment-verifier.js";
import { V0BranchRepository, type BranchProfileRow } from "../infra/repository.js";

export class V0BranchService {
  private readonly branchCountPerTenantHard = parsePositiveInt(
    process.env.V0_FAIRUSE_BRANCH_COUNT_PER_TENANT_HARD ??
      process.env.V0_BRANCH_COUNT_PER_TENANT_HARD,
    100
  );

  private readonly branchActivationRateLimit = parsePositiveInt(
    process.env.V0_FAIRUSE_BRANCH_ACTIVATION_RATE_LIMIT ??
      process.env.V0_BRANCH_ACTIVATION_RATE_LIMIT,
    30
  );

  private readonly branchActivationRateWindowSeconds = parsePositiveInt(
    process.env.V0_FAIRUSE_BRANCH_ACTIVATION_WINDOW_SECONDS ??
      process.env.V0_BRANCH_ACTIVATION_RATE_WINDOW_SECONDS,
    3600
  );

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

    return branches.map((branch) => mapBranchProfile(branch));
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

    return mapBranchProfile(branch);
  }

  async setCurrentBranchKhqrReceiver(input: {
    actor: OrgActorContext;
    khqrReceiverAccountId: unknown;
    khqrReceiverName: unknown;
  }) {
    const scope = assertBranchContext(input.actor);
    const hasAccess = await this.repo.hasActiveBranchAssignment({
      accountId: scope.accountId,
      tenantId: scope.tenantId,
      branchId: scope.branchId,
    });
    if (!hasAccess) {
      throw new V0OrgAccountError(403, "no active branch assignment for branch");
    }

    const accountId = String(input.khqrReceiverAccountId ?? "").trim();
    if (!accountId) {
      throw new V0OrgAccountError(
        422,
        "khqrReceiverAccountId is required",
        "ORG_BRANCH_KHQR_RECEIVER_INVALID"
      );
    }
    const name = normalizeOptionalString(input.khqrReceiverName);

    const updated = await this.repo.setBranchKhqrReceiver({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      khqrReceiverAccountId: accountId,
      khqrReceiverName: name,
    });
    if (!updated) {
      throw new V0OrgAccountError(404, "branch not found");
    }

    return mapBranchProfile(updated);
  }

  async setCurrentBranchAttendanceLocationSettings(input: {
    actor: OrgActorContext;
    attendanceLocationVerificationMode: unknown;
    workplaceLocation: unknown;
  }) {
    const scope = assertBranchContext(input.actor);
    const hasAccess = await this.repo.hasActiveBranchAssignment({
      accountId: scope.accountId,
      tenantId: scope.tenantId,
      branchId: scope.branchId,
    });
    if (!hasAccess) {
      throw new V0OrgAccountError(403, "no active branch assignment for branch");
    }

    const mode = parseAttendanceLocationVerificationMode(input.attendanceLocationVerificationMode);
    const workplace = parseWorkplaceLocation(input.workplaceLocation);

    const updated = await this.repo.setBranchAttendanceLocationSettings({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      attendanceLocationVerificationMode: mode,
      workplaceLatitude: workplace?.latitude ?? null,
      workplaceLongitude: workplace?.longitude ?? null,
      workplaceRadiusMeters: workplace?.radiusMeters ?? null,
    });
    if (!updated) {
      throw new V0OrgAccountError(404, "branch not found");
    }

    return mapBranchProfile(updated);
  }

  async initiateFirstBranchActivation(input: {
    actor: OrgActorContext;
    branchName: string;
  }): Promise<{
    draftId: string;
    tenantId: string;
    branchName: string;
    activationType: "FIRST_BRANCH" | "ADDITIONAL_BRANCH";
    draftStatus: "PENDING_PAYMENT";
    invoice: {
      invoiceId: string;
      invoiceType: "FIRST_BRANCH_ACTIVATION" | "ADDITIONAL_BRANCH_ACTIVATION";
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

    const existingDraft = await this.repo.findPendingFirstBranchActivationDraft(scope.tenantId);
    if (existingDraft) {
      return mapPendingDraft(existingDraft, false);
    }
    const activationAttemptCount = await this.repo.recordFairUseEventAndCountRecent({
      accountId: scope.accountId,
      actionKey: "org.branch.activation.initiate",
      windowSeconds: this.branchActivationRateWindowSeconds,
    });
    if (activationAttemptCount > this.branchActivationRateLimit) {
      throw new V0OrgAccountError(
        429,
        "branch activation is rate-limited; try again later",
        "FAIRUSE_RATE_LIMITED"
      );
    }
    const branchCount = await this.repo.countBranchesByTenant(scope.tenantId);
    if (branchCount >= this.branchCountPerTenantHard) {
      throw new V0OrgAccountError(
        409,
        "branch creation hard limit reached for this tenant",
        "FAIRUSE_HARD_LIMIT_EXCEEDED"
      );
    }
    const activationType = resolveActivationType(branchCount);

    const createdDraft = await this.repo.createFirstBranchActivationDraftWithInvoice({
      tenantId: scope.tenantId,
      requestedByAccountId: scope.accountId,
      branchDisplayName: branchName,
      activationType,
      invoiceType:
        activationType === "FIRST_BRANCH"
          ? "FIRST_BRANCH_ACTIVATION"
          : "ADDITIONAL_BRANCH_ACTIVATION",
      totalAmountUsd: resolveBranchActivationAmountUsd(activationType),
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
    activationType: "FIRST_BRANCH" | "ADDITIONAL_BRANCH";
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
        activationType: activationDraft.activation_type,
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
        mapBranchActivationPaymentDenialCode(payment.reasonCode)
      );
    }

    const branch = await this.repo.createActiveBranch({
      tenantId: scope.tenantId,
      branchName: activationDraft.branch_display_name,
    });
    const membershipId = await this.repo.findActiveMembershipId({
      tenantId: scope.tenantId,
      accountId: scope.accountId,
    });
    if (!membershipId) {
      throw new V0OrgAccountError(
        403,
        "no active tenant membership for requester",
        "NO_MEMBERSHIP"
      );
    }
    await this.repo.assignActiveBranch({
      tenantId: scope.tenantId,
      branchId: branch.id,
      accountId: scope.accountId,
      membershipId,
    });
    await this.repo.markInvoicePaid(activationDraft.invoice_id);
    await this.repo.markDraftActivated({
      draftId: activationDraft.draft_id,
      branchId: branch.id,
      paymentConfirmationRef: payment.confirmationReference ?? null,
    });
    if (activationDraft.activation_type === "FIRST_BRANCH") {
      await this.repo.setBillingAnchorIfUnset(scope.tenantId);
    }
    await this.repo.seedDefaultBranchEntitlements({
      tenantId: scope.tenantId,
      branchId: branch.id,
    });

    return {
      draftId: activationDraft.draft_id,
      branchId: branch.id,
      tenantId: branch.tenant_id,
      branchName: branch.name,
      activationType: activationDraft.activation_type,
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
    activation_type: "FIRST_BRANCH" | "ADDITIONAL_BRANCH";
    draft_status: "PENDING_PAYMENT" | "ACTIVATED" | "CANCELLED";
    invoice_id: string;
    invoice_type: "FIRST_BRANCH_ACTIVATION" | "ADDITIONAL_BRANCH_ACTIVATION";
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
  activationType: "FIRST_BRANCH" | "ADDITIONAL_BRANCH";
  draftStatus: "PENDING_PAYMENT";
  invoice: {
    invoiceId: string;
    invoiceType: "FIRST_BRANCH_ACTIVATION" | "ADDITIONAL_BRANCH_ACTIVATION";
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
    activationType: draft.activation_type,
    draftStatus: draft.draft_status,
    invoice: {
      invoiceId: draft.invoice_id,
      invoiceType: draft.invoice_type,
      status: draft.invoice_status,
      currency: draft.invoice_currency,
      totalAmountUsd: draft.invoice_total_amount_usd,
      issuedAt: draft.invoice_issued_at.toISOString(),
      paidAt: draft.invoice_paid_at ? draft.invoice_paid_at.toISOString() : null,
    },
    created,
  };
}

function mapBranchProfile(branch: BranchProfileRow) {
  return {
    branchId: branch.id,
    tenantId: branch.tenant_id,
    branchName: branch.name,
    branchAddress: branch.address,
    contactNumber: branch.contact_phone,
    khqrReceiverAccountId: branch.khqr_receiver_account_id,
    khqrReceiverName: branch.khqr_receiver_name,
    attendanceLocationVerificationMode: branch.attendance_location_verification_mode,
    workplaceLocation:
      branch.workplace_latitude !== null &&
      branch.workplace_longitude !== null &&
      branch.workplace_radius_meters !== null
        ? {
            latitude: branch.workplace_latitude,
            longitude: branch.workplace_longitude,
            radiusMeters: branch.workplace_radius_meters,
          }
        : null,
    status: branch.status,
  };
}

function resolveBranchActivationAmountUsd(
  activationType: "FIRST_BRANCH" | "ADDITIONAL_BRANCH"
): string {
  const envKey =
    activationType === "FIRST_BRANCH"
      ? "V0_FIRST_BRANCH_ACTIVATION_FEE_USD"
      : "V0_ADDITIONAL_BRANCH_ACTIVATION_FEE_USD";
  const fallback =
    activationType === "FIRST_BRANCH"
      ? "5.00"
      : String(process.env.V0_FIRST_BRANCH_ACTIVATION_FEE_USD ?? "5.00");
  const raw = String(process.env[envKey] ?? fallback).trim();
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new V0OrgAccountError(
      500,
      `invalid ${envKey} configuration`
    );
  }
  return parsed.toFixed(2);
}

function resolveActivationType(
  branchCount: number
): "FIRST_BRANCH" | "ADDITIONAL_BRANCH" {
  return branchCount <= 0 ? "FIRST_BRANCH" : "ADDITIONAL_BRANCH";
}

function mapBranchActivationPaymentDenialCode(reasonCode?: string): string {
  void reasonCode;
  return "BRANCH_ACTIVATION_PAYMENT_REQUIRED";
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function parseAttendanceLocationVerificationMode(
  input: unknown
): "disabled" | "checkin_only" | "checkin_and_checkout" {
  const normalized = String(input ?? "")
    .trim()
    .toLowerCase();
  if (
    normalized !== "disabled" &&
    normalized !== "checkin_only" &&
    normalized !== "checkin_and_checkout"
  ) {
    throw new V0OrgAccountError(
      422,
      "attendanceLocationVerificationMode must be disabled|checkin_only|checkin_and_checkout",
      "ORG_BRANCH_ATTENDANCE_LOCATION_MODE_INVALID"
    );
  }
  return normalized;
}

function parseWorkplaceLocation(input: unknown): {
  latitude: number;
  longitude: number;
  radiusMeters: number;
} | null {
  if (input === null || input === undefined) {
    return null;
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new V0OrgAccountError(
      422,
      "workplaceLocation must be an object or null",
      "ORG_BRANCH_WORKPLACE_LOCATION_INVALID"
    );
  }

  const body = input as Record<string, unknown>;
  const latitude = parseCoordinate(
    body.latitude,
    -90,
    90,
    "workplaceLocation.latitude must be in range [-90, 90]"
  );
  const longitude = parseCoordinate(
    body.longitude,
    -180,
    180,
    "workplaceLocation.longitude must be in range [-180, 180]"
  );
  const radiusMeters = parsePositiveIntegerInRange(
    body.radiusMeters,
    5,
    5000,
    "workplaceLocation.radiusMeters must be in range [5, 5000]"
  );

  return {
    latitude,
    longitude,
    radiusMeters,
  };
}

function parseCoordinate(
  value: unknown,
  min: number,
  max: number,
  message: string
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new V0OrgAccountError(
      422,
      message,
      "ORG_BRANCH_WORKPLACE_COORDINATE_INVALID"
    );
  }
  return parsed;
}

function parsePositiveIntegerInRange(
  value: unknown,
  min: number,
  max: number,
  message: string
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new V0OrgAccountError(
      422,
      message,
      "ORG_BRANCH_WORKPLACE_RADIUS_INVALID"
    );
  }
  return parsed;
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
