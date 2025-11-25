import { Router } from "express";
import {
  authenticate,
  validateBody,
  validateParams,
} from "../../../../platform/http/middleware/index.js";
import { BranchMenuController } from "../controller/index.js";
import {
  setBranchAvailabilitySchema,
  setBranchPriceSchema,
  menuItemIdParamSchema,
} from "../schemas/schemas.js";

const branchMenuRouter = Router();

/**
 * @openapi
 * /v1/menu/items/{menuItemId}/branches/availability:
 *   put:
 *     summary: Set branch-specific availability for a menu item
 *     tags:
 *       - BranchMenu
 *     parameters:
 *       - in: path
 *         name: menuItemId
 *         required: true
 *         schema:
 *           type: string
 *         description: Menu item ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SetBranchAvailabilityInput'
 *     responses:
 *       200:
 *         description: Branch availability set
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Menu item not found
 */
branchMenuRouter.put(
  "/v1/menu/items/:menuItemId/branches/availability",
  authenticate,
  validateParams(menuItemIdParamSchema),
  validateBody(setBranchAvailabilitySchema),
  BranchMenuController.setAvailability
);

/**
 * @openapi
 * /v1/menu/items/{menuItemId}/branches/price:
 *   put:
 *     summary: Set branch-specific price override for a menu item
 *     tags:
 *       - BranchMenu
 *     parameters:
 *       - in: path
 *         name: menuItemId
 *         required: true
 *         schema:
 *           type: string
 *         description: Menu item ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SetBranchPriceInput'
 *     responses:
 *       200:
 *         description: Branch price override set
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Menu item not found
 */
branchMenuRouter.put(
  "/v1/menu/items/:menuItemId/branches/price",
  authenticate,
  validateParams(menuItemIdParamSchema),
  validateBody(setBranchPriceSchema),
  BranchMenuController.setPriceOverride
);

export { branchMenuRouter };
