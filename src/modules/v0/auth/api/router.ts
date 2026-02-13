import { Router, type Request, type Response } from "express";
import { V0AuthError, V0AuthService } from "../app/service.js";
import { requireV0Auth, type V0AuthRequest } from "./middleware.js";

export function createV0AuthRouter(service: V0AuthService): Router {
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

  router.post(
    "/memberships/invite",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      try {
        const requesterAccountId = req.v0Auth?.accountId;
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
      try {
        const requesterAccountId = req.v0Auth?.accountId;
        if (!requesterAccountId) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await service.acceptInvitation({
          requesterAccountId,
          membershipId: req.params.membershipId,
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
      try {
        const requesterAccountId = req.v0Auth?.accountId;
        if (!requesterAccountId) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await service.rejectInvitation({
          requesterAccountId,
          membershipId: req.params.membershipId,
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
      try {
        const requesterAccountId = req.v0Auth?.accountId;
        if (!requesterAccountId) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await service.changeMembershipRole({
          requesterAccountId,
          membershipId: req.params.membershipId,
          roleKey: req.body?.roleKey,
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
      try {
        const requesterAccountId = req.v0Auth?.accountId;
        if (!requesterAccountId) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await service.revokeMembership({
          requesterAccountId,
          membershipId: req.params.membershipId,
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  return router;
}

function handleError(res: Response, error: unknown): void {
  if (error instanceof V0AuthError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: error instanceof Error ? error.message : "internal server error",
  });
}
