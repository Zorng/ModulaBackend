import type { Pool } from "pg";
import { TransactionManager } from "../../../../../platform/db/transactionManager.js";
import { V0CommandOutboxRepository } from "../../../../../platform/outbox/repository.js";
import { V0AuditService } from "../../../audit/app/service.js";
import { V0AuditRepository } from "../../../audit/infra/repository.js";
import { V0StaffManagementRepository } from "../infra/repository.js";
import { V0StaffManagementService } from "../app/service.js";

type AuditOutcome = "SUCCESS" | "REJECTED" | "FAILED";

export async function executeAssignMembershipBranchesCommand(input: {
  db: Pool;
  requesterAccountId: string;
  membershipId: unknown;
  branchIds: unknown;
  idempotencyKey: string | null;
  actionKey: string;
  eventType: string;
  endpoint: string;
}): Promise<{
  membershipId: string;
  tenantId: string;
  membershipStatus: string;
  pendingBranchIds: string[];
  activeBranchIds: string[];
}> {
  const transactionManager = new TransactionManager(input.db);

  return transactionManager.withTransaction(async (client) => {
    const txService = new V0StaffManagementService(new V0StaffManagementRepository(client));
    const txAuditService = new V0AuditService(new V0AuditRepository(client));
    const txOutboxRepository = new V0CommandOutboxRepository(client);

    const commandData = await txService.assignMembershipBranches({
      requesterAccountId: input.requesterAccountId,
      membershipId: input.membershipId as string,
      branchIds: input.branchIds as string[],
    });

    const dedupeKey = buildAuditDedupeKey(input.actionKey, input.idempotencyKey, "SUCCESS");
    await txAuditService.recordEvent({
      tenantId: commandData.tenantId,
      actorAccountId: input.requesterAccountId,
      actionKey: input.actionKey,
      outcome: "SUCCESS",
      entityType: "membership",
      entityId: commandData.membershipId,
      dedupeKey,
      metadata: {
        endpoint: input.endpoint,
        membershipStatus: commandData.membershipStatus,
        pendingBranchCount: commandData.pendingBranchIds.length,
        activeBranchCount: commandData.activeBranchIds.length,
      },
    });

    await txOutboxRepository.insertEvent({
      tenantId: commandData.tenantId,
      actionKey: input.actionKey,
      eventType: input.eventType,
      actorType: "ACCOUNT",
      actorId: input.requesterAccountId,
      entityType: "membership",
      entityId: commandData.membershipId,
      outcome: "SUCCESS",
      dedupeKey,
      payload: {
        endpoint: input.endpoint,
        membershipStatus: commandData.membershipStatus,
        pendingBranchCount: commandData.pendingBranchIds.length,
        activeBranchCount: commandData.activeBranchIds.length,
      },
    });

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
