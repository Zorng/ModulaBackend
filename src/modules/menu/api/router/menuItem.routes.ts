import { Router } from "express";
import {
  validateBody,
  validateParams,
} from "../../../../platform/http/middleware/index.js";
import { authMiddleware } from "../../../auth/index.js";

import { uploadSingleImage } from "../../../../platform/http/middleware/multer.js";
import { uploadOptionalSingleImage } from "../../../../platform/http/middleware/multer.js";
import { handleMulterError } from "../../../../platform/http/middleware/multer.js";

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
  (req, res, next) => authMiddleware.authenticate(req, res, next),
  MenuItemController.listByBranch
);

/**
 * @openapi
 * /v1/menu/items:
 *   get:
 *     summary: List all active menu items for the tenant
 *     description: |
 *       Retrieves all active menu items for the authenticated tenant.
 *
 *       **Note:** Only returns items where `isActive = true`.
 *     tags:
 *       - MenuItems
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of active menu items
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MenuItem'
 *                 total:
 *                   type: integer
 *                   description: Total number of active menu items
 *             example:
 *               items:
 *                 - id: "550e8400-e29b-41d4-a716-446655440000"
 *                   categoryId: "550e8400-e29b-41d4-a716-446655440001"
 *                   name: "Espresso"
 *                   description: "Strong coffee"
 *                   priceUsd: 3.50
 *                   imageUrl: "https://example.com/image.jpg"
 *                   isActive: true
 *                   createdAt: "2025-01-15T10:30:00Z"
 *                   updatedAt: "2025-01-15T10:30:00Z"
 *               total: 1
 *       401:
 *         description: Unauthorized
 */
menuItemRouter.get("/v1/menu/items", (req, res, next) => authMiddleware.authenticate(req, res, next), MenuItemController.list);

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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - categoryId
 *               - name
 *               - priceUsd
 *             properties:
 *               categoryId:
 *                 type: string
 *                 format: uuid
 *                 description: Category ID
 *               name:
 *                 type: string
 *                 description: Menu item name
 *               description:
 *                 type: string
 *                 description: Menu item description
 *               priceUsd:
 *                 type: number
 *                 description: Price in USD
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Image file (.jpg, .jpeg, .png, .webp)
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
  (req, res, next) => authMiddleware.authenticate(req, res, next),
  uploadOptionalSingleImage,
  (req, res, next) => {
    // Coerce priceUsd to number if present
    if (req.body.priceUsd !== undefined) {
      req.body.priceUsd = Number(req.body.priceUsd);
    }
    next();
  },
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
  (req, res, next) => authMiddleware.authenticate(req, res, next),
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               categoryId:
 *                 type: string
 *                 format: uuid
 *                 description: Category ID
 *               name:
 *                 type: string
 *                 description: Menu item name
 *               description:
 *                 type: string
 *                 description: Menu item description
 *               priceUsd:
 *                 type: number
 *                 description: Price in USD
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Image file (.jpg, .jpeg, .png, .webp)
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
  (req, res, next) => authMiddleware.authenticate(req, res, next),
  uploadOptionalSingleImage,
  (req, res, next) => {
    // Coerce priceUsd to number if present
    if (req.body.priceUsd !== undefined) {
      req.body.priceUsd = Number(req.body.priceUsd);
    }
    next();
  },
  validateParams(menuItemIdParamSchema),
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
  (req, res, next) => authMiddleware.authenticate(req, res, next),
  validateParams(menuItemIdParamSchema),
  MenuItemController.delete
);

export { menuItemRouter };
