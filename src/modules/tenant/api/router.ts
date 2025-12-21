import { Router } from "express";
import type { AuthMiddlewarePort } from "../../../platform/security/auth.js";
import {
  handleMulterError,
  uploadSingleImage,
} from "../../../platform/http/middleware/multer.js";
import type { TenantService } from "../app/tenant.service.js";

function requireRole(auth: AuthMiddlewarePort, roles: string[]) {
  if (!auth.requireRole) {
    throw new Error("AuthMiddlewarePort.requireRole is required for this route");
  }
  return auth.requireRole(roles);
}

export function createTenantRouter(
  tenantService: TenantService,
  authMiddleware: AuthMiddlewarePort
): Router {
  const router = Router();

  router.use(authMiddleware.authenticate);

  /**
   * @openapi
   * /v1/tenants/me/metadata:
   *   get:
   *     tags:
   *       - Tenant
   *     summary: Get tenant metadata (any authenticated staff)
   *     description: |
   *       Returns a small tenant metadata projection (name/logo/status) for UI display and module operations.
   *     security:
   *       - BearerAuth: []
   *     responses:
   *       200:
   *         description: Tenant metadata
   *         content:
   *           application/json:
   *             schema:
   *               $ref: "#/components/schemas/TenantMetadataResponse"
   *       401:
   *         description: Authentication required
   *       404:
   *         description: Tenant not found
   */
  router.get("/me/metadata", async (req: any, res, next) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const tenant = await tenantService.getMetadata(tenantId);
      res.json({ tenant });
    } catch (err) {
      if (err instanceof Error && err.message === "Tenant not found") {
        return res.status(404).json({ error: err.message });
      }
      next(err);
    }
  });

  /**
   * @openapi
   * /v1/tenants/me:
   *   get:
   *     tags:
   *       - Tenant
   *     summary: Get current tenant business profile (Admin only)
   *     security:
   *       - BearerAuth: []
   *     responses:
   *       200:
   *         description: Tenant profile
   *         content:
   *           application/json:
   *             schema:
   *               $ref: "#/components/schemas/TenantProfileResponse"
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Admin role required
   *       404:
   *         description: Tenant not found
   */
  router.get(
    "/me",
    requireRole(authMiddleware, ["ADMIN"]),
    async (req: any, res, next) => {
      try {
        const tenantId = req.user?.tenantId;
        if (!tenantId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const profile = await tenantService.getProfile(tenantId);
        res.json({
          tenant: {
            id: profile.id,
            name: profile.name,
            business_type: profile.business_type ?? null,
            status: profile.status,
            logo_url: profile.logo_url ?? null,
            contact_phone: profile.contact_phone ?? null,
            contact_email: profile.contact_email ?? null,
            contact_address: profile.contact_address ?? null,
            created_at: profile.created_at,
            updated_at: profile.updated_at,
            branch_count: profile.branch_count,
          },
        });
      } catch (err) {
        if (err instanceof Error && err.message === "Tenant not found") {
          return res.status(404).json({ error: err.message });
        }
        next(err);
      }
    }
  );

  /**
   * @openapi
   * /v1/tenants/me:
   *   patch:
   *     tags:
   *       - Tenant
   *     summary: Update tenant business profile (Admin only)
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: "#/components/schemas/UpdateTenantProfileRequest"
   *     responses:
   *       200:
   *         description: Tenant updated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: "#/components/schemas/TenantProfileUpdateResponse"
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Admin role required
   *       422:
   *         description: Validation error
   */
  router.patch(
    "/me",
    requireRole(authMiddleware, ["ADMIN"]),
    async (req: any, res, next) => {
      try {
        const tenantId = req.user?.tenantId;
        const employeeId = req.user?.employeeId;
        if (!tenantId || !employeeId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const updates = req.body ?? {};
        const updated = await tenantService.updateProfile({
          tenantId,
          actorEmployeeId: employeeId,
          updates: {
            name: updates.name,
            contact_phone: updates.contact_phone,
            contact_email: updates.contact_email,
            contact_address: updates.contact_address,
          },
        });

        res.json({
          tenant: {
            id: updated.id,
            name: updated.name,
            business_type: updated.business_type ?? null,
            status: updated.status,
            logo_url: updated.logo_url ?? null,
            contact_phone: updated.contact_phone ?? null,
            contact_email: updated.contact_email ?? null,
            contact_address: updated.contact_address ?? null,
            created_at: updated.created_at,
            updated_at: updated.updated_at,
          },
        });
      } catch (err) {
        if (err instanceof Error) {
          if (err.message === "Tenant not found") {
            return res.status(404).json({ error: err.message });
          }
          if (
            err.message.includes("must be") ||
            err.message.includes("valid")
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
   * /v1/tenants/me/logo:
   *   put:
   *     tags:
   *       - Tenant
   *     summary: Upload/update tenant logo (Admin only)
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required:
   *               - image
   *             properties:
   *               image:
   *                 type: string
   *                 format: binary
   *                 description: Logo image (JPEG/PNG/WebP, max 5MB)
   *     responses:
   *       200:
   *         description: Tenant logo updated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: "#/components/schemas/TenantProfileUpdateResponse"
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Admin role required
   *       422:
   *         description: Missing image
   */
  router.put(
    "/me/logo",
    requireRole(authMiddleware, ["ADMIN"]),
    uploadSingleImage,
    handleMulterError,
    async (req: any, res, next) => {
      try {
        const tenantId = req.user?.tenantId;
        const employeeId = req.user?.employeeId;
        if (!tenantId || !employeeId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        if (!req.file) {
          return res.status(422).json({ error: "image is required" });
        }

        if (!req.app?.locals?.imageStorage?.uploadImage) {
          throw new Error("Image storage not configured");
        }

        const logoUrl: string = await req.app.locals.imageStorage.uploadImage(
          req.file.buffer,
          req.file.originalname,
          tenantId,
          "tenant"
        );

        const updated = await tenantService.updateLogo({
          tenantId,
          logoUrl,
          actorEmployeeId: employeeId,
        });

        res.json({
          tenant: {
            id: updated.id,
            name: updated.name,
            business_type: updated.business_type ?? null,
            status: updated.status,
            logo_url: updated.logo_url ?? null,
            contact_phone: updated.contact_phone ?? null,
            contact_email: updated.contact_email ?? null,
            contact_address: updated.contact_address ?? null,
            created_at: updated.created_at,
            updated_at: updated.updated_at,
          },
        });
      } catch (err) {
        if (err instanceof Error && err.message === "Tenant not found") {
          return res.status(404).json({ error: err.message });
        }
        next(err);
      }
    }
  );

  return router;
}
