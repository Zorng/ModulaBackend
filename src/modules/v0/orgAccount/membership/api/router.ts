import type { Pool } from "pg";
import { Router, type Response } from "express";
import { requireV0Auth, type V0AuthRequest } from "../../../auth/api/middleware.js";
import { V0OrgAccountError } from "../../common/error.js";
import {
  executeAcceptInvitationCommand,
  executeChangeMembershipRoleCommand,
  executeInviteMembershipCommand,
  executeRejectInvitationCommand,
  executeRevokeMembershipCommand,
  queryInvitationInbox,
} from "./membership.command.js";

export function createV0MembershipRouter(db: Pool): Router {
  const router = Router();

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
          endpoint: "/v0/org/memberships/invite",
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
          endpoint: "/v0/org/memberships/invitations/:membershipId/accept",
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
          actionKey: "org.membership.invitation.reject",
          eventType: "ORG_MEMBERSHIP_INVITATION_REJECTED",
          endpoint: "/v0/org/memberships/invitations/:membershipId/reject",
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
          endpoint: "/v0/org/memberships/:membershipId/role",
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
          endpoint: "/v0/org/memberships/:membershipId/revoke",
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  return router;
}

function readIdempotencyKey(headers: Record<string, string | string[] | undefined>): string | null {
  const raw = headers["idempotency-key"];
  if (Array.isArray(raw)) {
    return normalizeOptionalString(raw[0]);
  }
  return normalizeOptionalString(raw);
}

function normalizeOptionalString(input: unknown): string | null {
  const normalized = String(input ?? "").trim();
  return normalized ? normalized : null;
}

function handleError(res: Response, error: unknown): void {
  if (error instanceof V0OrgAccountError) {
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
