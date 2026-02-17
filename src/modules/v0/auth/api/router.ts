import { Router, type Request, type Response } from "express";
import { V0AuthError, V0AuthService } from "../app/service.js";
import { requireV0Auth, type V0AuthRequest } from "./middleware.js";
import { V0AuditService } from "../../audit/app/service.js";

export function createV0AuthRouter(
  service: V0AuthService,
  auditService: V0AuditService
): Router {
  const router = Router();

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

        const data = await service.inviteMembership({
          requesterAccountId,
          tenantId: req.body?.tenantId,
          phone: req.body?.phone,
          roleKey: req.body?.roleKey,
        });
        await writeTenantAuditBestEffort(auditService, {
          tenantId: data.tenantId,
          actorAccountId: requesterAccountId,
          actionKey,
          outcome: "SUCCESS",
          entityType: "membership",
          entityId: data.membershipId,
          dedupeKey: buildAuditDedupeKey(actionKey, idempotencyKey, "SUCCESS"),
          metadata: {
            endpoint: "/v0/auth/memberships/invite",
            roleKey: data.roleKey,
          },
        });
        res.status(201).json({ success: true, data });
      } catch (error) {
        await writeTenantAuditBestEffort(auditService, {
          tenantId: normalizeOptionalString(req.body?.tenantId),
          actorAccountId: requesterAccountId ?? null,
          actionKey,
          outcome: classifyAuditOutcome(error),
          reasonCode: classifyAuditReasonCode(error),
          entityType: "membership",
          dedupeKey: buildAuditDedupeKey(
            actionKey,
            idempotencyKey,
            classifyAuditOutcome(error)
          ),
          metadata: {
            endpoint: "/v0/auth/memberships/invite",
            error: serializeError(error),
          },
        });
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

        const data = await service.acceptInvitation({
          requesterAccountId,
          membershipId: req.params.membershipId,
        });
        await writeTenantAuditBestEffort(auditService, {
          tenantId: data.tenantId,
          actorAccountId: requesterAccountId,
          actionKey,
          outcome: "SUCCESS",
          entityType: "membership",
          entityId: data.membershipId,
          dedupeKey: buildAuditDedupeKey(actionKey, idempotencyKey, "SUCCESS"),
          metadata: {
            endpoint: "/v0/auth/memberships/invitations/:membershipId/accept",
          },
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        await writeTenantAuditBestEffort(auditService, {
          tenantId: normalizeOptionalString(req.v0Auth?.tenantId),
          actorAccountId: requesterAccountId ?? null,
          actionKey,
          outcome: classifyAuditOutcome(error),
          reasonCode: classifyAuditReasonCode(error),
          entityType: "membership",
          entityId: normalizeOptionalString(req.params.membershipId),
          dedupeKey: buildAuditDedupeKey(
            actionKey,
            idempotencyKey,
            classifyAuditOutcome(error)
          ),
          metadata: {
            endpoint: "/v0/auth/memberships/invitations/:membershipId/accept",
            error: serializeError(error),
          },
        });
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

        const data = await service.rejectInvitation({
          requesterAccountId,
          membershipId: req.params.membershipId,
        });
        await writeTenantAuditBestEffort(auditService, {
          tenantId: data.tenantId,
          actorAccountId: requesterAccountId,
          actionKey,
          outcome: "SUCCESS",
          entityType: "membership",
          entityId: data.membershipId,
          dedupeKey: buildAuditDedupeKey(actionKey, idempotencyKey, "SUCCESS"),
          metadata: {
            endpoint: "/v0/auth/memberships/invitations/:membershipId/reject",
          },
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        await writeTenantAuditBestEffort(auditService, {
          tenantId: normalizeOptionalString(req.v0Auth?.tenantId),
          actorAccountId: requesterAccountId ?? null,
          actionKey,
          outcome: classifyAuditOutcome(error),
          reasonCode: classifyAuditReasonCode(error),
          entityType: "membership",
          entityId: normalizeOptionalString(req.params.membershipId),
          dedupeKey: buildAuditDedupeKey(
            actionKey,
            idempotencyKey,
            classifyAuditOutcome(error)
          ),
          metadata: {
            endpoint: "/v0/auth/memberships/invitations/:membershipId/reject",
            error: serializeError(error),
          },
        });
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

        const data = await service.changeMembershipRole({
          requesterAccountId,
          membershipId: req.params.membershipId,
          roleKey: req.body?.roleKey,
        });
        await writeTenantAuditBestEffort(auditService, {
          tenantId: data.tenantId,
          actorAccountId: requesterAccountId,
          actionKey,
          outcome: "SUCCESS",
          entityType: "membership",
          entityId: data.membershipId,
          dedupeKey: buildAuditDedupeKey(actionKey, idempotencyKey, "SUCCESS"),
          metadata: {
            endpoint: "/v0/auth/memberships/:membershipId/role",
            roleKey: data.roleKey,
          },
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        await writeTenantAuditBestEffort(auditService, {
          tenantId: normalizeOptionalString(req.v0Auth?.tenantId),
          actorAccountId: requesterAccountId ?? null,
          actionKey,
          outcome: classifyAuditOutcome(error),
          reasonCode: classifyAuditReasonCode(error),
          entityType: "membership",
          entityId: normalizeOptionalString(req.params.membershipId),
          dedupeKey: buildAuditDedupeKey(
            actionKey,
            idempotencyKey,
            classifyAuditOutcome(error)
          ),
          metadata: {
            endpoint: "/v0/auth/memberships/:membershipId/role",
            error: serializeError(error),
          },
        });
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

        const data = await service.revokeMembership({
          requesterAccountId,
          membershipId: req.params.membershipId,
        });
        await writeTenantAuditBestEffort(auditService, {
          tenantId: data.tenantId,
          actorAccountId: requesterAccountId,
          actionKey,
          outcome: "SUCCESS",
          entityType: "membership",
          entityId: data.membershipId,
          dedupeKey: buildAuditDedupeKey(actionKey, idempotencyKey, "SUCCESS"),
          metadata: {
            endpoint: "/v0/auth/memberships/:membershipId/revoke",
          },
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        await writeTenantAuditBestEffort(auditService, {
          tenantId: normalizeOptionalString(req.v0Auth?.tenantId),
          actorAccountId: requesterAccountId ?? null,
          actionKey,
          outcome: classifyAuditOutcome(error),
          reasonCode: classifyAuditReasonCode(error),
          entityType: "membership",
          entityId: normalizeOptionalString(req.params.membershipId),
          dedupeKey: buildAuditDedupeKey(
            actionKey,
            idempotencyKey,
            classifyAuditOutcome(error)
          ),
          metadata: {
            endpoint: "/v0/auth/memberships/:membershipId/revoke",
            error: serializeError(error),
          },
        });
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

        const data = await service.assignMembershipBranches({
          requesterAccountId,
          membershipId: req.params.membershipId,
          branchIds: req.body?.branchIds,
        });
        await writeTenantAuditBestEffort(auditService, {
          tenantId: data.tenantId,
          actorAccountId: requesterAccountId,
          actionKey,
          outcome: "SUCCESS",
          entityType: "membership",
          entityId: data.membershipId,
          dedupeKey: buildAuditDedupeKey(actionKey, idempotencyKey, "SUCCESS"),
          metadata: {
            endpoint: "/v0/auth/memberships/:membershipId/branches",
            membershipStatus: data.membershipStatus,
            pendingBranchCount: data.pendingBranchIds.length,
            activeBranchCount: data.activeBranchIds.length,
          },
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        await writeTenantAuditBestEffort(auditService, {
          tenantId: normalizeOptionalString(req.v0Auth?.tenantId),
          actorAccountId: requesterAccountId ?? null,
          actionKey,
          outcome: classifyAuditOutcome(error),
          reasonCode: classifyAuditReasonCode(error),
          entityType: "membership",
          entityId: normalizeOptionalString(req.params.membershipId),
          dedupeKey: buildAuditDedupeKey(
            actionKey,
            idempotencyKey,
            classifyAuditOutcome(error)
          ),
          metadata: {
            endpoint: "/v0/auth/memberships/:membershipId/branches",
            error: serializeError(error),
          },
        });
        handleError(res, error);
      }
    }
  );

  router.post(
    "/tenants",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      const requesterAccountId = req.v0Auth?.accountId;
      const actionKey = "tenant.provision";
      const idempotencyKey = readIdempotencyKey(req.headers);
      try {
        if (!requesterAccountId) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await service.createTenant({
          requesterAccountId,
          tenantName: req.body?.tenantName,
          firstBranchName: req.body?.firstBranchName,
        });
        const branchId = data.branch?.id ?? null;
        await writeTenantAuditBestEffort(auditService, {
          tenantId: data.tenant.id,
          branchId,
          actorAccountId: requesterAccountId,
          actionKey,
          outcome: "SUCCESS",
          entityType: "tenant",
          entityId: data.tenant.id,
          dedupeKey: buildAuditDedupeKey(actionKey, idempotencyKey, "SUCCESS"),
          metadata: {
            endpoint: "/v0/auth/tenants",
            branchId,
            ownerMembershipId: data.ownerMembership.id,
          },
        });
        res.status(201).json({ success: true, data });
      } catch (error) {
        await writeTenantAuditBestEffort(auditService, {
          tenantId: normalizeOptionalString(req.v0Auth?.tenantId),
          actorAccountId: requesterAccountId ?? null,
          actionKey,
          outcome: classifyAuditOutcome(error),
          reasonCode: classifyAuditReasonCode(error),
          entityType: "tenant",
          dedupeKey: buildAuditDedupeKey(
            actionKey,
            idempotencyKey,
            classifyAuditOutcome(error)
          ),
          metadata: {
            endpoint: "/v0/auth/tenants",
            error: serializeError(error),
          },
        });
        handleError(res, error);
      }
    }
  );

  return router;
}

type AuditOutcome = "SUCCESS" | "REJECTED" | "FAILED";

async function writeTenantAuditBestEffort(
  auditService: V0AuditService,
  input: {
    tenantId: string | null;
    branchId?: string | null;
    actorAccountId?: string | null;
    actionKey: string;
    outcome: AuditOutcome;
    reasonCode?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    dedupeKey?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const tenantId = normalizeOptionalString(input.tenantId);
  if (!tenantId) {
    return;
  }

  try {
    await auditService.recordEvent({
      tenantId,
      branchId: normalizeOptionalString(input.branchId),
      actorAccountId: normalizeOptionalString(input.actorAccountId),
      actionKey: input.actionKey,
      outcome: input.outcome,
      reasonCode: normalizeOptionalString(input.reasonCode),
      entityType: normalizeOptionalString(input.entityType),
      entityId: normalizeOptionalString(input.entityId),
      dedupeKey: normalizeOptionalString(input.dedupeKey),
      metadata: input.metadata ?? null,
    });
  } catch {
    // Tenant audit should not block the primary auth flow.
  }
}

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

function classifyAuditOutcome(error: unknown): AuditOutcome {
  if (error instanceof V0AuthError) {
    return error.statusCode >= 500 ? "FAILED" : "REJECTED";
  }
  return "FAILED";
}

function classifyAuditReasonCode(error: unknown): string {
  if (error instanceof V0AuthError) {
    if (error.code) {
      return error.code;
    }
    return normalizeReasonCode(error.message);
  }
  return "AUTH_FLOW_FAILED";
}

function normalizeReasonCode(input: string): string {
  const normalized = String(input ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return normalized || "AUTH_REJECTED";
}

function normalizeOptionalString(input: unknown): string | null {
  const normalized = String(input ?? "").trim();
  return normalized ? normalized : null;
}

function serializeError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  return {
    name: "UnknownError",
    message: "unknown error",
  };
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
