import { V0SubscriptionRepository } from "../infra/repository.js";

export class V0SubscriptionError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "V0SubscriptionError";
  }
}

type ActorContext = {
  accountId: string;
  tenantId: string | null;
  branchId: string | null;
};

export class V0SubscriptionService {
  constructor(private readonly repo: V0SubscriptionRepository) {}

  async getCurrentSubscriptionState(input: { actor: ActorContext }) {
    const tenantId = assertTenantContext(input.actor);
    const row = await this.repo.getSubscriptionState(tenantId);
    if (!row) {
      return {
        tenantId,
        state: "ACTIVE" as const,
        graceUntil: null,
        updatedAt: null,
      };
    }

    return {
      tenantId: row.tenant_id,
      state: row.state,
      graceUntil: row.grace_until ? row.grace_until.toISOString() : null,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async getCurrentBranchEntitlements(input: { actor: ActorContext }) {
    const { tenantId, branchId } = assertBranchContext(input.actor);
    const rows = await this.repo.listBranchEntitlements({ tenantId, branchId });
    return {
      tenantId,
      branchId,
      entitlements: rows.map((row) => ({
        entitlementKey: row.entitlement_key,
        enforcement: row.enforcement,
        updatedAt: row.updated_at.toISOString(),
      })),
    };
  }
}

function assertTenantContext(actor: ActorContext): string {
  const accountId = String(actor.accountId ?? "").trim();
  const tenantId = String(actor.tenantId ?? "").trim();
  if (!accountId) {
    throw new V0SubscriptionError(401, "authentication required");
  }
  if (!tenantId) {
    throw new V0SubscriptionError(403, "tenant context required");
  }
  return tenantId;
}

function assertBranchContext(actor: ActorContext): {
  tenantId: string;
  branchId: string;
} {
  const tenantId = assertTenantContext(actor);
  const branchId = String(actor.branchId ?? "").trim();
  if (!branchId) {
    throw new V0SubscriptionError(403, "branch context required");
  }
  return { tenantId, branchId };
}
