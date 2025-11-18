import { Router } from "express";
import {
  authenticate,
  validateBody,
  validateParams,
} from "../../../../platform/http/middleware/index.js";
import { ModifierController } from "../controller/index.js";
import {
  createModifierGroupSchema,
  addModifierOptionSchema,
  attachModifierSchema,
  menuItemIdParamSchema,
} from "../schemas/schemas.js";

const modifierRouter = Router();

/**
 * @openapi
 * /v1/menu/modifiers/groups:
 *   post:
 *     summary: Create a new modifier group
 *     tags:
 *       - Modifiers
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateModifierGroupInput'
 *     responses:
 *       201:
 *         description: Modifier group created
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
modifierRouter.post(
  "/v1/menu/modifiers/groups",
  authenticate,
  validateBody(createModifierGroupSchema),
  ModifierController.createGroup
);

/**
 * @openapi
 * /v1/menu/modifiers/options:
 *   post:
 *     summary: Add a modifier option
 *     tags:
 *       - Modifiers
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AddModifierOptionInput'
 *     responses:
 *       201:
 *         description: Modifier option added
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
modifierRouter.post(
  "/v1/menu/modifiers/options",
  authenticate,
  validateBody(addModifierOptionSchema),
  ModifierController.addOption
);

/**
 * @openapi
 * /v1/menu/items/{menuItemId}/modifiers:
 *   post:
 *     summary: Attach a modifier group to a menu item
 *     tags:
 *       - Modifiers
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
 *             $ref: '#/components/schemas/AttachModifierInput'
 *     responses:
 *       200:
 *         description: Modifier group attached
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Menu item not found
 */
modifierRouter.post(
  "/v1/menu/items/:menuItemId/modifiers",
  authenticate,
  validateParams(menuItemIdParamSchema),
  validateBody(attachModifierSchema),
  ModifierController.attatchToItem
);

export { modifierRouter };
