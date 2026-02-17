import type { Pool } from "pg";
import { Router, type Response } from "express";
import { requireV0Auth, type V0AuthRequest } from "../../../auth/api/middleware.js";
import { V0AuthError } from "../../../auth/app/service.js";
import { V0OrgAccountError } from "../../../orgAccount/app/service.js";
import { executeAssignMembershipBranchesCommand } from "./assignment.command.js";
import { V0StaffManagementError } from "../app/service.js";

export function createV0StaffManagementRouter(db: Pool): Router {
  const router = Router();

  router.post(
    "/staff/memberships/:membershipId/branches",
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
          endpoint: "/v0/hr/staff/memberships/:membershipId/branches",
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
  if (
    error instanceof V0StaffManagementError ||
    error instanceof V0AuthError ||
    error instanceof V0OrgAccountError
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
