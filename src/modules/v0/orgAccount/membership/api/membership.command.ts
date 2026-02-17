import type { Pool } from "pg";
import { TransactionManager } from "../../../../../platform/db/transactionManager.js";
import { V0CommandOutboxRepository } from "../../../../../platform/outbox/repository.js";
import { V0AuditService } from "../../../audit/app/service.js";
import { V0AuditRepository } from "../../../audit/infra/repository.js";
import { V0AuthService } from "../../../auth/app/service.js";
import { V0AuthRepository } from "../../../auth/infra/repository.js";
import { V0StaffManagementRepository } from "../../../hr/staffManagement/infra/repository.js";
import { V0StaffManagementService } from "../../../hr/staffManagement/app/service.js";

type AuditOutcome = "SUCCESS" | "REJECTED" | "FAILED";

type MembershipWriteBase = {
  db: Pool;
  requesterAccountId: string;
  idempotencyKey: string | null;
  actionKey: string;
  eventType: string;
  endpoint: string;
};

export async function executeInviteMembershipCommand(
  input: MembershipWriteBase & { tenantId: unknown; phone: unknown; roleKey: unknown }
): Promise<{
  membershipId: string;
  tenantId: string;
  accountId: string;
  phone: string;
  roleKey: string;
  status: string;
}> {
  const transactionManager = new TransactionManager(input.db);

  return transactionManager.withTransaction(async (client) => {
    const txService = new V0AuthService(new V0AuthRepository(client));
    const txAuditService = new V0AuditService(new V0AuditRepository(client));
    const txOutboxRepository = new V0CommandOutboxRepository(client);

    const commandData = await txService.inviteMembership({
      requesterAccountId: input.requesterAccountId,
      tenantId: input.tenantId as string,
      phone: input.phone as string,
      roleKey: input.roleKey as string,
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
        roleKey: commandData.roleKey,
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
        roleKey: commandData.roleKey,
        phone: commandData.phone,
      },
    });

    return commandData;
  });
}

export async function queryInvitationInbox(input: {
  db: Pool;
  requesterAccountId: string;
}): Promise<{
  invitations: Array<{
    membershipId: string;
    tenantId: string;
    tenantName: string;
    roleKey: string;
    invitedAt: string;
    invitedByMembershipId: string | null;
  }>;
}> {
  const service = new V0AuthService(new V0AuthRepository(input.db));
  return service.listInvitationInbox({ requesterAccountId: input.requesterAccountId });
}

export async function executeAcceptInvitationCommand(
  input: MembershipWriteBase & { membershipId: unknown }
): Promise<{
  membershipId: string;
  tenantId: string;
  status: string;
  activeBranchIds: string[];
}> {
  const transactionManager = new TransactionManager(input.db);

  return transactionManager.withTransaction(async (client) => {
    const txService = new V0AuthService(new V0AuthRepository(client));
    const txStaffManagementService = new V0StaffManagementService(
      new V0StaffManagementRepository(client)
    );
    const txAuditService = new V0AuditService(new V0AuditRepository(client));
    const txOutboxRepository = new V0CommandOutboxRepository(client);

    const membership = await txService.acceptInvitation({
      requesterAccountId: input.requesterAccountId,
      membershipId: input.membershipId as string,
    });
    const projectionData = await txStaffManagementService.activateMembershipBranchAssignments({
      membershipId: membership.membershipId,
    });
    const commandData = {
      membershipId: membership.membershipId,
      tenantId: membership.tenantId,
      status: membership.status,
      activeBranchIds: projectionData.activeBranchIds,
    };

    const dedupeKey = buildAuditDedupeKey(input.actionKey, input.idempotencyKey, "SUCCESS");
    await txAuditService.recordEvent({
      tenantId: commandData.tenantId,
      actorAccountId: input.requesterAccountId,
      actionKey: input.actionKey,
      outcome: "SUCCESS",
      entityType: "membership",
      entityId: commandData.membershipId,
      dedupeKey,
      metadata: { endpoint: input.endpoint },
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
        activeBranchCount: commandData.activeBranchIds.length,
      },
    });

    return commandData;
  });
}

export async function executeRejectInvitationCommand(
  input: MembershipWriteBase & { membershipId: unknown }
): Promise<{
  membershipId: string;
  tenantId: string;
  status: string;
}> {
  const transactionManager = new TransactionManager(input.db);

  return transactionManager.withTransaction(async (client) => {
    const txService = new V0AuthService(new V0AuthRepository(client));
    const txAuditService = new V0AuditService(new V0AuditRepository(client));
    const txOutboxRepository = new V0CommandOutboxRepository(client);

    const commandData = await txService.rejectInvitation({
      requesterAccountId: input.requesterAccountId,
      membershipId: input.membershipId as string,
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
      metadata: { endpoint: input.endpoint },
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
      },
    });

    return commandData;
  });
}

export async function executeChangeMembershipRoleCommand(
  input: MembershipWriteBase & { membershipId: unknown; roleKey: unknown }
): Promise<{ membershipId: string; tenantId: string; roleKey: string }> {
  const transactionManager = new TransactionManager(input.db);

  return transactionManager.withTransaction(async (client) => {
    const txService = new V0AuthService(new V0AuthRepository(client));
    const txAuditService = new V0AuditService(new V0AuditRepository(client));
    const txOutboxRepository = new V0CommandOutboxRepository(client);

    const commandData = await txService.changeMembershipRole({
      requesterAccountId: input.requesterAccountId,
      membershipId: input.membershipId as string,
      roleKey: input.roleKey as string,
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
        roleKey: commandData.roleKey,
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
        roleKey: commandData.roleKey,
      },
    });

    return commandData;
  });
}

export async function executeRevokeMembershipCommand(
  input: MembershipWriteBase & { membershipId: unknown }
): Promise<{ membershipId: string; tenantId: string; status: string }> {
  const transactionManager = new TransactionManager(input.db);

  return transactionManager.withTransaction(async (client) => {
    const txService = new V0AuthService(new V0AuthRepository(client));
    const txAuditService = new V0AuditService(new V0AuditRepository(client));
    const txOutboxRepository = new V0CommandOutboxRepository(client);

    const commandData = await txService.revokeMembership({
      requesterAccountId: input.requesterAccountId,
      membershipId: input.membershipId as string,
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
