import { Router } from "express";
import type { RequestHandler } from "express";
import type { AccountSettingsRepository } from "../infra/repository.js";

export interface AuthMiddlewarePort {
  authenticate: RequestHandler;
}

export function createAccountSettingsRouter(
  repo: AccountSettingsRepository,
  auth: AuthMiddlewarePort
): Router {
  const router = Router();

  router.patch(
    "/me/display-name",
    auth.authenticate,
    async (req: any, res, next) => {
      try {
        const displayName = req.body?.display_name;
        if (!displayName || typeof displayName !== "string") {
          return res
            .status(422)
            .json({ error: "display_name is required" });
        }

        const trimmed = displayName.trim();
        if (trimmed.length < 1 || trimmed.length > 100) {
          return res.status(422).json({
            error: "display_name must be between 1 and 100 characters",
          });
        }

        if (!req.user?.employeeId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const profile = await repo.updateDisplayName(
          req.user.employeeId,
          trimmed
        );

        res.json({ profile });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

