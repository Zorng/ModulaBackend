import type { Pool } from "pg";
import { Router, type Request, type Response } from "express";
import { V0AuthError, V0AuthService } from "../app/service.js";
import { V0AuthRepository } from "../infra/repository.js";
import { requireV0Auth, type V0AuthRequest } from "./middleware.js";
import { V0OrgAccountError } from "../../orgAccount/common/error.js";
import { V0StaffManagementError } from "../../hr/staffManagement/app/service.js";
import {
  executeAcceptInvitationCommand,
  executeChangeMembershipRoleCommand,
  executeInviteMembershipCommand,
  executeRejectInvitationCommand,
  executeRevokeMembershipCommand,
  queryInvitationInbox,
} from "../../orgAccount/membership/api/membership.command.js";
import { executeTenantProvisioningCommand } from "../../orgAccount/tenant/api/tenant-provisioning.command.js";
import { executeAssignMembershipBranchesCommand } from "../../hr/staffManagement/api/assignment.command.js";
import { readOptionalHeaderString } from "../../../../shared/utils/http.js";

export function createV0AuthRouter(
  service: V0AuthService,
  db: Pool
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
      const idempotencyKey = readIdempotencyKey(req.headers);
      try {
        if (!requesterAccountId) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await executeInviteMembershipCommand({
          db,
          requesterAccountId,
          tenantId: req.body?.tenantId,
          phone: req.body?.phone,
          roleKey: req.body?.roleKey,
          idempotencyKey,
          actionKey: "org.membership.invite",
          eventType: "ORG_MEMBERSHIP_INVITED",
          endpoint: "/v0/auth/memberships/invite",
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

        const data = await queryInvitationInbox({ db, requesterAccountId });
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
      const idempotencyKey = readIdempotencyKey(req.headers);
      try {
        if (!requesterAccountId) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await executeAcceptInvitationCommand({
          db,
          requesterAccountId,
          membershipId: req.params.membershipId,
          idempotencyKey,
          actionKey: "org.membership.invitation.accept",
          eventType: "ORG_MEMBERSHIP_INVITATION_ACCEPTED",
          endpoint: "/v0/auth/memberships/invitations/:membershipId/accept",
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
      const idempotencyKey = readIdempotencyKey(req.headers);
      try {
        if (!requesterAccountId) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await executeRejectInvitationCommand({
          db,
          requesterAccountId,
          membershipId: req.params.membershipId,
          idempotencyKey,
          actionKey: "org.membership.invitation.revoke",
          eventType: "ORG_MEMBERSHIP_INVITATION_REVOKED",
          endpoint: "/v0/auth/memberships/invitations/:membershipId/reject",
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
      const idempotencyKey = readIdempotencyKey(req.headers);
      try {
        if (!requesterAccountId) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await executeChangeMembershipRoleCommand({
          db,
          requesterAccountId,
          membershipId: req.params.membershipId,
          roleKey: req.body?.roleKey,
          idempotencyKey,
          actionKey: "org.membership.role.change",
          eventType: "ORG_MEMBERSHIP_ROLE_CHANGED",
          endpoint: "/v0/auth/memberships/:membershipId/role",
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
      const idempotencyKey = readIdempotencyKey(req.headers);
      try {
        if (!requesterAccountId) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await executeRevokeMembershipCommand({
          db,
          requesterAccountId,
          membershipId: req.params.membershipId,
          idempotencyKey,
          actionKey: "org.membership.revoke",
          eventType: "ORG_MEMBERSHIP_REVOKED",
          endpoint: "/v0/auth/memberships/:membershipId/revoke",
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
      const idempotencyKey = readIdempotencyKey(req.headers);
      try {
        if (!requesterAccountId) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await executeAssignMembershipBranchesCommand({
          db,
          requesterAccountId,
          membershipId: req.params.membershipId,
          branchIds: req.body?.branchIds,
          idempotencyKey,
          actionKey: "hr.staff.branch.assign",
          eventType: "HR_STAFF_BRANCHES_ASSIGNED",
          endpoint: "/v0/auth/memberships/:membershipId/branches",
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

function readIdempotencyKey(headers: Record<string, string | string[] | undefined>): string | null {
  return readOptionalHeaderString(headers, "idempotency-key");
}

function handleError(res: Response, error: unknown): void {
  if (
    error instanceof V0AuthError
    || error instanceof V0OrgAccountError
    || error instanceof V0StaffManagementError
  ) {
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
