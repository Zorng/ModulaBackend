import { Router } from "express";
import {
  authenticate,
  validateBody,
  validateParams,
} from "../../../../platform/http/middleware/index.js";
import { MenuItemController } from "../controller/index.js";
import {
  createMenuItemSchema,
  updateMenuItemSchema,
  menuItemIdParamSchema,
} from "../schemas/schemas.js";

const menuItemRouter = Router();

/**
 * @openapi
 * /v1/menu/items/by-branch:
 *   get:
 *     summary: List menu items for a specific branch
 *     tags:
 *       - MenuItems
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
 *         description: List of menu items for the branch
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
menuItemRouter.get(
  "/v1/menu/items/by-branch",
  authenticate,
  MenuItemController.listByBranch
);

/**
 * @openapi
 * /v1/menu/items:
 *   post:
 *     summary: Create a new menu item
 *     tags:
 *       - MenuItems
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateMenuItemInput'
 *     responses:
 *       201:
 *         description: Menu item created
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
menuItemRouter.post(
  "/v1/menu/items",
  authenticate,
  validateBody(createMenuItemSchema),
  MenuItemController.create
);

/**
 * @openapi
 * /v1/menu/items/{menuItemId}:
 *   get:
 *     summary: Get a menu item by ID
 *     tags:
 *       - MenuItems
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: menuItemId
 *         required: true
 *         schema:
 *           type: string
 *         description: Menu item ID
 *     responses:
 *       200:
 *         description: Menu item details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MenuItem'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Menu item not found
 */
menuItemRouter.get(
  "/v1/menu/items/:menuItemId",
  authenticate,
  validateParams(menuItemIdParamSchema),
  MenuItemController.get
);

/**
 * @openapi
 * /v1/menu/items/{menuItemId}:
 *   patch:
 *     summary: Update a menu item
 *     tags:
 *       - MenuItems
 *     security:
 *       - BearerAuth: []
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
 *             $ref: '#/components/schemas/UpdateMenuItemInput'
 *     responses:
 *       200:
 *         description: Menu item updated
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Menu item not found
 */
menuItemRouter.patch(
  "/v1/menu/items/:menuItemId",
  authenticate,
  validateParams(menuItemIdParamSchema),
  validateBody(updateMenuItemSchema),
  MenuItemController.update
);

/**
 * @openapi
 * /v1/menu/items/{menuItemId}:
 *   delete:
 *     summary: Delete a menu item
 *     tags:
 *       - MenuItems
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: menuItemId
 *         required: true
 *         schema:
 *           type: string
 *         description: Menu item ID
 *     responses:
 *       204:
 *         description: Menu item deleted
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Menu item not found
 */
menuItemRouter.delete(
  "/v1/menu/items/:menuItemId",
  authenticate,
  validateParams(menuItemIdParamSchema),
  MenuItemController.delete
);

export { menuItemRouter };
