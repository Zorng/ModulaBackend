import type { Pool } from "pg";
import { TransactionManager } from "../../../../platform/db/transactionManager.js";
import { V0CommandOutboxRepository } from "../../../../platform/outbox/repository.js";
import { V0AuditService } from "../../audit/app/service.js";
import { V0AuditRepository } from "../../audit/infra/repository.js";
import { V0OrgAccountService } from "../app/service.js";
import { V0OrgAccountRepository } from "../infra/repository.js";

type AuditOutcome = "SUCCESS" | "REJECTED" | "FAILED";

export async function executeTenantProvisioningCommand(input: {
  db: Pool;
  requesterAccountId: string;
  tenantName: unknown;
  firstBranchName: unknown;
  idempotencyKey: string | null;
  endpoint: string;
}): Promise<{
  tenant: { id: string; name: string; status: string };
  ownerMembership: { id: string; roleKey: string; status: string };
  branch: { id: string; name: string; status: string } | null;
}> {
  const transactionManager = new TransactionManager(input.db);
  const actionKey = "tenant.provision";

  const data = await transactionManager.withTransaction(async (client) => {
    const txService = new V0OrgAccountService(new V0OrgAccountRepository(client));
    const txAuditService = new V0AuditService(new V0AuditRepository(client));
    const txOutboxRepository = new V0CommandOutboxRepository(client);

    const commandData = await txService.createTenant({
      requesterAccountId: input.requesterAccountId,
      tenantName: input.tenantName as string,
      firstBranchName: input.firstBranchName as string | undefined,
    });

    const branchId = commandData.branch?.id ?? null;
    const dedupeKey = buildAuditDedupeKey(actionKey, input.idempotencyKey, "SUCCESS");

    await txAuditService.recordEvent({
      tenantId: commandData.tenant.id,
      branchId,
      actorAccountId: input.requesterAccountId,
      actionKey,
      outcome: "SUCCESS",
      entityType: "tenant",
      entityId: commandData.tenant.id,
      dedupeKey,
      metadata: {
        endpoint: input.endpoint,
        branchId,
        ownerMembershipId: commandData.ownerMembership.id,
      },
    });

    await txOutboxRepository.insertEvent({
      tenantId: commandData.tenant.id,
      branchId,
      actionKey,
      eventType: "TENANT_PROVISIONED",
      actorType: "ACCOUNT",
      actorId: input.requesterAccountId,
      entityType: "tenant",
      entityId: commandData.tenant.id,
      outcome: "SUCCESS",
      dedupeKey,
      payload: {
        endpoint: input.endpoint,
        branchId,
        ownerMembershipId: commandData.ownerMembership.id,
      },
    });

    return commandData;
  });

  return data;
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
