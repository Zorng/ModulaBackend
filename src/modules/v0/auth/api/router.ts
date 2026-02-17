import type { Pool } from "pg";
import { Router, type Request, type Response } from "express";
import { V0AuthError, V0AuthService } from "../app/service.js";
import { V0AuthRepository } from "../infra/repository.js";
import { requireV0Auth, type V0AuthRequest } from "./middleware.js";
import { V0AuditService } from "../../audit/app/service.js";
import { V0AuditRepository } from "../../audit/infra/repository.js";
import { TransactionManager } from "../../../../platform/db/transactionManager.js";
import { V0CommandOutboxRepository } from "../../../../platform/outbox/repository.js";
import { V0OrgAccountError } from "../../orgAccount/app/service.js";
import { executeTenantProvisioningCommand } from "../../orgAccount/api/tenant-provisioning.command.js";

export function createV0AuthRouter(
  service: V0AuthService,
  db: Pool
): Router {
  const router = Router();
  const transactionManager = new TransactionManager(db);

  router.post("/register", async (req: Request, res: Response) => {
    try {
      const data = await service.register({
        phone: req.body?.phone,
        password: req.body?.password,
        firstName: req.body?.firstName,
        lastName: req.body?.lastName,
        gender: req.body?.gender,
        dateOfBirth: req.body?.dateOfBirth,
      });
      res.status(201).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post("/otp/send", async (req: Request, res: Response) => {
    try {
      const data = await service.sendRegistrationOtp({
        phone: req.body?.phone,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post("/otp/verify", async (req: Request, res: Response) => {
    try {
      const data = await service.verifyRegistrationOtp({
        phone: req.body?.phone,
        otp: req.body?.otp,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post("/login", async (req: Request, res: Response) => {
    try {
      const data = await service.login({
        phone: req.body?.phone,
        password: req.body?.password,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post("/refresh", async (req: Request, res: Response) => {
    try {
      const data = await service.refresh({
        refreshToken: req.body?.refreshToken,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post("/logout", async (req: Request, res: Response) => {
    try {
      await service.logout({
        refreshToken: req.body?.refreshToken,
      });
      res.status(200).json({ success: true });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get(
    "/context/tenants",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      try {
        const requesterAccountId = req.v0Auth?.accountId;
        if (!requesterAccountId) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await service.listTenantContext({
          requesterAccountId,
          currentTenantId: req.v0Auth?.tenantId ?? null,
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post(
    "/context/tenant/select",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      try {
        const requesterAccountId = req.v0Auth?.accountId;
        if (!requesterAccountId) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await service.selectTenantContext({
          requesterAccountId,
          tenantId: req.body?.tenantId,
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.get(
    "/context/branches",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      try {
        const requesterAccountId = req.v0Auth?.accountId;
        if (!requesterAccountId) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await service.listBranchContext({
          requesterAccountId,
          currentTenantId: req.v0Auth?.tenantId ?? null,
          currentBranchId: req.v0Auth?.branchId ?? null,
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post(
    "/context/branch/select",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      try {
        const requesterAccountId = req.v0Auth?.accountId;
        if (!requesterAccountId) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await service.selectBranchContext({
          requesterAccountId,
          tenantId: req.v0Auth?.tenantId ?? null,
          branchId: req.body?.branchId,
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post(
    "/memberships/invite",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      const requesterAccountId = req.v0Auth?.accountId;
      const actionKey = "auth.membership.invite";
      const idempotencyKey = readIdempotencyKey(req.headers);
      try {
        if (!requesterAccountId) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await transactionManager.withTransaction(async (client) => {
          const txService = new V0AuthService(new V0AuthRepository(client));
          const txAuditService = new V0AuditService(new V0AuditRepository(client));
          const txOutboxRepository = new V0CommandOutboxRepository(client);

          const commandData = await txService.inviteMembership({
            requesterAccountId,
            tenantId: req.body?.tenantId,
            phone: req.body?.phone,
            roleKey: req.body?.roleKey,
          });

          const dedupeKey = buildAuditDedupeKey(actionKey, idempotencyKey, "SUCCESS");
          await txAuditService.recordEvent({
            tenantId: commandData.tenantId,
            actorAccountId: requesterAccountId,
            actionKey,
            outcome: "SUCCESS",
            entityType: "membership",
            entityId: commandData.membershipId,
            dedupeKey,
            metadata: {
              endpoint: "/v0/auth/memberships/invite",
              roleKey: commandData.roleKey,
            },
          });
          await txOutboxRepository.insertEvent({
            tenantId: commandData.tenantId,
            actionKey,
            eventType: "AUTH_MEMBERSHIP_INVITED",
            actorType: "ACCOUNT",
            actorId: requesterAccountId,
            entityType: "membership",
            entityId: commandData.membershipId,
            outcome: "SUCCESS",
            dedupeKey,
            payload: {
              endpoint: "/v0/auth/memberships/invite",
              roleKey: commandData.roleKey,
              phone: commandData.phone,
            },
          });
          return commandData;
        });
        res.status(201).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.get(
    "/memberships/invitations",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      try {
        const requesterAccountId = req.v0Auth?.accountId;
        if (!requesterAccountId) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await service.listInvitationInbox({ requesterAccountId });
        res.status(200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post(
    "/memberships/invitations/:membershipId/accept",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      const requesterAccountId = req.v0Auth?.accountId;
      const actionKey = "auth.membership.invitation.accept";
      const idempotencyKey = readIdempotencyKey(req.headers);
      try {
        if (!requesterAccountId) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await transactionManager.withTransaction(async (client) => {
          const txService = new V0AuthService(new V0AuthRepository(client));
          const txAuditService = new V0AuditService(new V0AuditRepository(client));
          const txOutboxRepository = new V0CommandOutboxRepository(client);

          const commandData = await txService.acceptInvitation({
            requesterAccountId,
            membershipId: req.params.membershipId,
          });

          const dedupeKey = buildAuditDedupeKey(actionKey, idempotencyKey, "SUCCESS");
          await txAuditService.recordEvent({
            tenantId: commandData.tenantId,
            actorAccountId: requesterAccountId,
            actionKey,
            outcome: "SUCCESS",
            entityType: "membership",
            entityId: commandData.membershipId,
            dedupeKey,
            metadata: {
              endpoint: "/v0/auth/memberships/invitations/:membershipId/accept",
            },
          });
          await txOutboxRepository.insertEvent({
            tenantId: commandData.tenantId,
            actionKey,
            eventType: "AUTH_MEMBERSHIP_INVITATION_ACCEPTED",
            actorType: "ACCOUNT",
            actorId: requesterAccountId,
            entityType: "membership",
            entityId: commandData.membershipId,
            outcome: "SUCCESS",
            dedupeKey,
            payload: {
              endpoint: "/v0/auth/memberships/invitations/:membershipId/accept",
              activeBranchCount: commandData.activeBranchIds.length,
            },
          });
          return commandData;
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post(
    "/memberships/invitations/:membershipId/reject",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      const requesterAccountId = req.v0Auth?.accountId;
      const actionKey = "auth.membership.invitation.reject";
      const idempotencyKey = readIdempotencyKey(req.headers);
      try {
        if (!requesterAccountId) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await transactionManager.withTransaction(async (client) => {
          const txService = new V0AuthService(new V0AuthRepository(client));
          const txAuditService = new V0AuditService(new V0AuditRepository(client));
          const txOutboxRepository = new V0CommandOutboxRepository(client);

          const commandData = await txService.rejectInvitation({
            requesterAccountId,
            membershipId: req.params.membershipId,
          });

          const dedupeKey = buildAuditDedupeKey(actionKey, idempotencyKey, "SUCCESS");
          await txAuditService.recordEvent({
            tenantId: commandData.tenantId,
            actorAccountId: requesterAccountId,
            actionKey,
            outcome: "SUCCESS",
            entityType: "membership",
            entityId: commandData.membershipId,
            dedupeKey,
            metadata: {
              endpoint: "/v0/auth/memberships/invitations/:membershipId/reject",
            },
          });
          await txOutboxRepository.insertEvent({
            tenantId: commandData.tenantId,
            actionKey,
            eventType: "AUTH_MEMBERSHIP_INVITATION_REJECTED",
            actorType: "ACCOUNT",
            actorId: requesterAccountId,
            entityType: "membership",
            entityId: commandData.membershipId,
            outcome: "SUCCESS",
            dedupeKey,
            payload: {
              endpoint: "/v0/auth/memberships/invitations/:membershipId/reject",
            },
          });
          return commandData;
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post(
    "/memberships/:membershipId/role",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      const requesterAccountId = req.v0Auth?.accountId;
      const actionKey = "auth.membership.role.change";
      const idempotencyKey = readIdempotencyKey(req.headers);
      try {
        if (!requesterAccountId) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await transactionManager.withTransaction(async (client) => {
          const txService = new V0AuthService(new V0AuthRepository(client));
          const txAuditService = new V0AuditService(new V0AuditRepository(client));
          const txOutboxRepository = new V0CommandOutboxRepository(client);

          const commandData = await txService.changeMembershipRole({
            requesterAccountId,
            membershipId: req.params.membershipId,
            roleKey: req.body?.roleKey,
          });

          const dedupeKey = buildAuditDedupeKey(actionKey, idempotencyKey, "SUCCESS");
          await txAuditService.recordEvent({
            tenantId: commandData.tenantId,
            actorAccountId: requesterAccountId,
            actionKey,
            outcome: "SUCCESS",
            entityType: "membership",
            entityId: commandData.membershipId,
            dedupeKey,
            metadata: {
              endpoint: "/v0/auth/memberships/:membershipId/role",
              roleKey: commandData.roleKey,
            },
          });
          await txOutboxRepository.insertEvent({
            tenantId: commandData.tenantId,
            actionKey,
            eventType: "AUTH_MEMBERSHIP_ROLE_CHANGED",
            actorType: "ACCOUNT",
            actorId: requesterAccountId,
            entityType: "membership",
            entityId: commandData.membershipId,
            outcome: "SUCCESS",
            dedupeKey,
            payload: {
              endpoint: "/v0/auth/memberships/:membershipId/role",
              roleKey: commandData.roleKey,
            },
          });
          return commandData;
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post(
    "/memberships/:membershipId/revoke",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      const requesterAccountId = req.v0Auth?.accountId;
      const actionKey = "auth.membership.revoke";
      const idempotencyKey = readIdempotencyKey(req.headers);
      try {
        if (!requesterAccountId) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await transactionManager.withTransaction(async (client) => {
          const txService = new V0AuthService(new V0AuthRepository(client));
          const txAuditService = new V0AuditService(new V0AuditRepository(client));
          const txOutboxRepository = new V0CommandOutboxRepository(client);

          const commandData = await txService.revokeMembership({
            requesterAccountId,
            membershipId: req.params.membershipId,
          });

          const dedupeKey = buildAuditDedupeKey(actionKey, idempotencyKey, "SUCCESS");
          await txAuditService.recordEvent({
            tenantId: commandData.tenantId,
            actorAccountId: requesterAccountId,
            actionKey,
            outcome: "SUCCESS",
            entityType: "membership",
            entityId: commandData.membershipId,
            dedupeKey,
            metadata: {
              endpoint: "/v0/auth/memberships/:membershipId/revoke",
            },
          });
          await txOutboxRepository.insertEvent({
            tenantId: commandData.tenantId,
            actionKey,
            eventType: "AUTH_MEMBERSHIP_REVOKED",
            actorType: "ACCOUNT",
            actorId: requesterAccountId,
            entityType: "membership",
            entityId: commandData.membershipId,
            outcome: "SUCCESS",
            dedupeKey,
            payload: {
              endpoint: "/v0/auth/memberships/:membershipId/revoke",
            },
          });
          return commandData;
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post(
    "/memberships/:membershipId/branches",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      const requesterAccountId = req.v0Auth?.accountId;
      const actionKey = "auth.membership.branches.assign";
      const idempotencyKey = readIdempotencyKey(req.headers);
      try {
        if (!requesterAccountId) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await transactionManager.withTransaction(async (client) => {
          const txService = new V0AuthService(new V0AuthRepository(client));
          const txAuditService = new V0AuditService(new V0AuditRepository(client));
          const txOutboxRepository = new V0CommandOutboxRepository(client);

          const commandData = await txService.assignMembershipBranches({
            requesterAccountId,
            membershipId: req.params.membershipId,
            branchIds: req.body?.branchIds,
          });

          const dedupeKey = buildAuditDedupeKey(actionKey, idempotencyKey, "SUCCESS");
          await txAuditService.recordEvent({
            tenantId: commandData.tenantId,
            actorAccountId: requesterAccountId,
            actionKey,
            outcome: "SUCCESS",
            entityType: "membership",
            entityId: commandData.membershipId,
            dedupeKey,
            metadata: {
              endpoint: "/v0/auth/memberships/:membershipId/branches",
              membershipStatus: commandData.membershipStatus,
              pendingBranchCount: commandData.pendingBranchIds.length,
              activeBranchCount: commandData.activeBranchIds.length,
            },
          });
          await txOutboxRepository.insertEvent({
            tenantId: commandData.tenantId,
            actionKey,
            eventType: "AUTH_MEMBERSHIP_BRANCHES_ASSIGNED",
            actorType: "ACCOUNT",
            actorId: requesterAccountId,
            entityType: "membership",
            entityId: commandData.membershipId,
            outcome: "SUCCESS",
            dedupeKey,
            payload: {
              endpoint: "/v0/auth/memberships/:membershipId/branches",
              membershipStatus: commandData.membershipStatus,
              pendingBranchCount: commandData.pendingBranchIds.length,
              activeBranchCount: commandData.activeBranchIds.length,
            },
          });
          return commandData;
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post(
    "/tenants",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      const requesterAccountId = req.v0Auth?.accountId;
      const idempotencyKey = readIdempotencyKey(req.headers);
      try {
        if (!requesterAccountId) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await executeTenantProvisioningCommand({
          db,
          requesterAccountId,
          tenantName: req.body?.tenantName,
          firstBranchName: req.body?.firstBranchName,
          idempotencyKey,
          endpoint: "/v0/auth/tenants",
        });

        res.status(201).json({ success: true, data });
      } catch (error) {
        if (error instanceof V0OrgAccountError) {
          res.status(error.statusCode).json({
            success: false,
            error: error.message,
            code: error.code ?? undefined,
          });
          return;
        }
        handleError(res, error);
      }
    }
  );

  return router;
}

type AuditOutcome = "SUCCESS" | "REJECTED" | "FAILED";

function readIdempotencyKey(headers: Record<string, string | string[] | undefined>): string | null {
  const raw = headers["idempotency-key"];
  if (Array.isArray(raw)) {
    return normalizeOptionalString(raw[0]);
  }
  return normalizeOptionalString(raw);
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

function handleError(res: Response, error: unknown): void {
  if (error instanceof V0AuthError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code ?? undefined,
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: error instanceof Error ? error.message : "internal server error",
  });
}
