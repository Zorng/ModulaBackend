import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { AuthMiddlewarePort } from "../../../platform/security/auth.js";
import type { BranchService } from "../app/branch.service.js";

function requireRole(auth: AuthMiddlewarePort, roles: string[]) {
  if (!auth.requireRole) {
    throw new Error("AuthMiddlewarePort.requireRole is required for this route");
  }
  return auth.requireRole(roles);
}

export function createBranchRouter(
  branchService: BranchService,
  authMiddleware: AuthMiddlewarePort
): Router {
  const router = Router();

  router.use(authMiddleware.authenticate);

  /**
   * @openapi
   * /v1/branches:
   *   get:
   *     tags:
   *       - Branch
   *     summary: List accessible branches
   *     description: |
   *       Returns branches accessible to the current user:
   *       - ADMIN: all branches in the tenant
   *       - MANAGER/CASHIER/CLERK: assigned branches only (Capstone I typically 1)
   *     security:
   *       - BearerAuth: []
   *     responses:
   *       200:
   *         description: Branch list
   *         content:
   *           application/json:
   *             schema:
   *               $ref: "#/components/schemas/BranchListResponse"
   *       401:
   *         description: Authentication required
   */
  router.get("/", async (req: any, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user?.tenantId;
      const employeeId = req.user?.employeeId;
      const role = req.user?.role;
      if (!tenantId || !employeeId || !role) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const branches = await branchService.listAccessibleBranches({
        tenantId,
        employeeId,
        role,
      });

      res.json({
        branches: branches.map((b) => ({
          id: b.id,
          tenant_id: b.tenant_id,
          name: b.name,
          address: b.address ?? null,
          contact_phone: b.contact_phone ?? null,
          contact_email: b.contact_email ?? null,
          status: b.status,
          created_at: b.created_at,
          updated_at: b.updated_at,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * @openapi
   * /v1/branches/{branchId}:
   *   patch:
   *     tags:
   *       - Branch
   *     summary: Update branch profile (Admin only)
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: branchId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: "#/components/schemas/UpdateBranchRequest"
   *     responses:
   *       200:
   *         description: Branch updated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: "#/components/schemas/BranchResponse"
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Admin role required
   *       404:
   *         description: Branch not found
   *       422:
   *         description: Validation error
   */
  router.patch(
    "/:branchId",
    requireRole(authMiddleware, ["ADMIN"]),
    async (req: any, res: Response, next: NextFunction) => {
      try {
        const tenantId = req.user?.tenantId;
        const employeeId = req.user?.employeeId;
        if (!tenantId || !employeeId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const branchId = req.params.branchId;
        if (!branchId) {
          return res.status(422).json({ error: "branchId is required" });
        }

        const updates = req.body ?? {};
        const updated = await branchService.updateBranchProfile({
          tenantId,
          branchId,
          actorEmployeeId: employeeId,
          updates: {
            name: updates.name,
            address: updates.address,
            contact_phone: updates.contact_phone,
            contact_email: updates.contact_email,
          },
        });

        res.json({
          branch: {
            id: updated.id,
            tenant_id: updated.tenant_id,
            name: updated.name,
            address: updated.address ?? null,
            contact_phone: updated.contact_phone ?? null,
            contact_email: updated.contact_email ?? null,
            status: updated.status,
            created_at: updated.created_at,
            updated_at: updated.updated_at,
          },
        });
      } catch (err) {
        if (err instanceof Error) {
          if (err.message === "Branch not found") {
            return res.status(404).json({ error: err.message });
          }
          if (
            err.message.includes("cannot be") ||
            err.message.includes("must be") ||
            err.message.includes("required")
          ) {
            return res.status(422).json({ error: err.message });
          }
        }
        next(err);
      }
    }
  );

  /**
   * @openapi
   * /v1/branches/{branchId}/freeze:
   *   post:
   *     tags:
   *       - Branch
   *     summary: Freeze a branch (Admin only)
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: branchId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Branch frozen
   *         content:
   *           application/json:
   *             schema:
   *               $ref: "#/components/schemas/BranchResponse"
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Admin role required
   *       404:
   *         description: Branch not found
   */
  router.post(
    "/:branchId/freeze",
    requireRole(authMiddleware, ["ADMIN"]),
    async (req: any, res: Response, next: NextFunction) => {
      try {
        const tenantId = req.user?.tenantId;
        const employeeId = req.user?.employeeId;
        if (!tenantId || !employeeId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const branchId = req.params.branchId;
        const updated = await branchService.freezeBranch({
          tenantId,
          branchId,
          actorEmployeeId: employeeId,
        });

        res.json({
          branch: {
            id: updated.id,
            tenant_id: updated.tenant_id,
            name: updated.name,
            address: updated.address ?? null,
            contact_phone: updated.contact_phone ?? null,
            contact_email: updated.contact_email ?? null,
            status: updated.status,
            created_at: updated.created_at,
            updated_at: updated.updated_at,
          },
        });
      } catch (err) {
        if (err instanceof Error && err.message === "Branch not found") {
          return res.status(404).json({ error: err.message });
        }
        next(err);
      }
    }
  );

  /**
   * @openapi
   * /v1/branches/{branchId}/unfreeze:
   *   post:
   *     tags:
   *       - Branch
   *     summary: Unfreeze a branch (Admin only)
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: branchId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Branch unfrozen
   *         content:
   *           application/json:
   *             schema:
   *               $ref: "#/components/schemas/BranchResponse"
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Admin role required
   *       404:
   *         description: Branch not found
   */
  router.post(
    "/:branchId/unfreeze",
    requireRole(authMiddleware, ["ADMIN"]),
    async (req: any, res: Response, next: NextFunction) => {
      try {
        const tenantId = req.user?.tenantId;
        const employeeId = req.user?.employeeId;
        if (!tenantId || !employeeId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const branchId = req.params.branchId;
        const updated = await branchService.unfreezeBranch({
          tenantId,
          branchId,
          actorEmployeeId: employeeId,
        });

        res.json({
          branch: {
            id: updated.id,
            tenant_id: updated.tenant_id,
            name: updated.name,
            address: updated.address ?? null,
            contact_phone: updated.contact_phone ?? null,
            contact_email: updated.contact_email ?? null,
            status: updated.status,
            created_at: updated.created_at,
            updated_at: updated.updated_at,
          },
        });
      } catch (err) {
        if (err instanceof Error && err.message === "Branch not found") {
          return res.status(404).json({ error: err.message });
        }
        next(err);
      }
    }
  );

  return router;
}
