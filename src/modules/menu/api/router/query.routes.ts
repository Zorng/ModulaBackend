import { Router } from "express";
import { validateQuery } from "../../../../platform/http/middleware/index.js";
import type { AuthMiddlewarePort } from "../../../../platform/security/auth.js";
import { QueryController } from "../controller/index.js";
import { branchIdQuerySchema } from "../schemas/schemas.js";

export function createQueryRouter(authMiddleware: AuthMiddlewarePort) {
  const queryRouter = Router();

/**
 * @openapi
 * /v1/menu/snapshot:
 *   get:
 *     summary: Get menu snapshot for a branch
 *     tags:
 *       - Query
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *         description: Branch ID
 *     responses:
 *       200:
 *         description: Menu snapshot
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MenuSnapshot'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Branch not found
 */
queryRouter.get(
  "/v1/menu/snapshot",
  (req, res, next) => authMiddleware.authenticate(req, res, next),
  validateQuery(branchIdQuerySchema),
  QueryController.getMenuSnapshot
);

  return queryRouter;
}
