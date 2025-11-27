import { Router } from "express";
import { validateQuery } from "../../../../platform/http/middleware/index.js";
import { authMiddleware } from "../../../auth/api/auth.router.js";
import { QueryController } from "../controller/index.js";
import { branchIdQuerySchema } from "../schemas/schemas.js";

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
 *               type: object
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Branch not found
 */
queryRouter.get(
  "/v1/menu/snapshot",
  authMiddleware.authenticate,
  validateQuery(branchIdQuerySchema),
  QueryController.getMenuSnapshot
);

export { queryRouter };
