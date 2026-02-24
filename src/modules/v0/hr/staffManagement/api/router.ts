import type { Pool } from "pg";
import { Router, type Response } from "express";
import { requireV0Auth, type V0AuthRequest } from "../../../auth/api/middleware.js";
import { V0AuthError } from "../../../auth/app/service.js";
import { V0OrgAccountError } from "../../../orgAccount/common/error.js";
import { executeAssignMembershipBranchesCommand } from "./assignment.command.js";
import { V0StaffManagementRepository } from "../infra/repository.js";
import { V0StaffManagementError, V0StaffManagementService } from "../app/service.js";
import { readOptionalHeaderString } from "../../../../../shared/utils/http.js";

export function createV0StaffManagementRouter(db: Pool): Router {
  const router = Router();
  const service = new V0StaffManagementService(new V0StaffManagementRepository(db));

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

  router.get("/staff", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await service.listStaffMembers({
        actor,
        status: asString(req.query?.status),
        search: asString(req.query?.search),
        limit: asNumber(req.query?.limit),
        offset: asNumber(req.query?.offset),
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get(
    "/staff/memberships/:membershipId/branches",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      try {
        const actor = req.v0Auth;
        if (!actor) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }

        const data = await service.getMembershipBranchAssignments({
          actor,
          membershipId: req.params.membershipId,
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.get("/staff/:membershipId", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await service.getStaffMember({
        actor,
        membershipId: req.params.membershipId,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;
}

function readIdempotencyKey(headers: Record<string, string | string[] | undefined>): string | null {
  return readOptionalHeaderString(headers, "idempotency-key");
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
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
