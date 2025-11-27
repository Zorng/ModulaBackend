import { Router } from "express";
import {
  validateBody,
  validateParams,
} from "../../../../platform/http/middleware/index.js";
import { authMiddleware } from "../../../auth/api/auth.router.js";
import { ModifierController } from "../controller/index.js";
import {
  createModifierGroupSchema,
  addModifierOptionSchema,
  attachModifierSchema,
  menuItemIdParamSchema,
} from "../schemas/schemas.js";
import {
  menuItemIdAndModifierGroupIdParamSchema,
  modifierGroupIdParamSchema,
  modifierOptionIdParamSchema,
  updateModifierGroupSchema,
  updateModifierOptionSchema,
} from "../schemas/modifier/modifier.js";

const modifierRouter = Router();

/**
 * @openapi
 * /v1/menu/modifiers/groups:
 *   post:
 *     summary: Create a new modifier group
 *     tags:
 *       - Modifiers
 *     security:
 *       - BearerAuth: []
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
  authMiddleware.authenticate,
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
 *     security:
 *       - BearerAuth: []
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
  authMiddleware.authenticate,
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
  authMiddleware.authenticate,
  validateParams(menuItemIdParamSchema),
  validateBody(attachModifierSchema),
  ModifierController.attatchToItem
);

/**
 * @openapi
 * /v1/menu/items/{menuItemId}/modifiers/{modifierGroupId}:
 *   delete:
 *     summary: Detach a modifier group from a menu item
 *     tags:
 *       - Modifiers
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: menuItemId
 *         required: true
 *         schema:
 *           type: string
 *         description: Menu item ID
 *       - in: path
 *         name: modifierGroupId
 *         required: true
 *         schema:
 *           type: string
 *         description: Modifier group ID
 *     responses:
 *       200:
 *         description: Modifier group detached
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Menu item or modifier group not found
 */
modifierRouter.delete(
  "/v1/menu/items/:menuItemId/modifiers/:modifierGroupId",
  authMiddleware.authenticate,
  validateParams(menuItemIdAndModifierGroupIdParamSchema),
  ModifierController.detachFromItem
);

/**
 * @openapi
 * /v1/menu/modifiers/groups:
 *   get:
 *     summary: List all modifier groups for tenant
 *     tags:
 *       - Modifiers
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of modifier groups
 *       401:
 *         description: Unauthorized
 */
modifierRouter.get(
  "/v1/menu/modifiers/groups",
  authMiddleware.authenticate,
  ModifierController.listGroups
);

/**
 * @openapi
 * /v1/menu/modifiers/groups/{modifierGroupId}:
 *   get:
 *     summary: Get a single modifier group
 *     tags:
 *       - Modifiers
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: modifierGroupId
 *         required: true
 *         schema:
 *           type: string
 *         description: Modifier group ID
 *     responses:
 *       200:
 *         description: Modifier group found
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not found
 */
modifierRouter.get(
  "/v1/menu/modifiers/groups/:modifierGroupId",
  authMiddleware.authenticate,
  validateParams(modifierGroupIdParamSchema),
  ModifierController.getGroup
);

/**
 * @openapi
 * /v1/menu/modifiers/groups/{modifierGroupId}:
 *   patch:
 *     summary: Update a modifier group
 *     tags:
 *       - Modifiers
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: modifierGroupId
 *         required: true
 *         schema:
 *           type: string
 *         description: Modifier group ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Modifier group name
 *               selectionType:
 *                 type: string
 *                 enum: [SINGLE, MULTI]
 *                 description: Selection type for the group
 *             additionalProperties: false
 *             minProperties: 1
 *             example:
 *               name: "Toppings"
 *               selectionType: "MULTI"
 *     responses:
 *       200:
 *         description: Modifier group updated
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not found
 */
modifierRouter.patch(
  "/v1/menu/modifiers/groups/:modifierGroupId",
  authMiddleware.authenticate,
  validateParams(modifierGroupIdParamSchema),
  validateBody(updateModifierGroupSchema),
  ModifierController.updateGroup
);

/**
 * @openapi
 * /v1/menu/modifiers/groups/{modifierGroupId}:
 *   delete:
 *     summary: Soft delete a modifier group
 *     tags:
 *       - Modifiers
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: modifierGroupId
 *         required: true
 *         schema:
 *           type: string
 *         description: Modifier group ID
 *     responses:
 *       200:
 *         description: Modifier group soft-deleted
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not found
 */
modifierRouter.delete(
  "/v1/menu/modifiers/groups/:modifierGroupId",
  authMiddleware.authenticate,
  validateParams(modifierGroupIdParamSchema),
  ModifierController.softDeleteGroup
);

/**
 * @openapi
 * /v1/menu/modifiers/groups/{modifierGroupId}/hard:
 *   delete:
 *     summary: Hard delete a modifier group
 *     tags:
 *       - Modifiers
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: modifierGroupId
 *         required: true
 *         schema:
 *           type: string
 *         description: Modifier group ID
 *     responses:
 *       200:
 *         description: Modifier group hard-deleted
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not found
 */
modifierRouter.delete(
  "/v1/menu/modifiers/groups/:modifierGroupId/hard",
  authMiddleware.authenticate,
  validateParams(modifierGroupIdParamSchema),
  ModifierController.hardDeleteGroup
);

/**
 * @openapi
 * /v1/menu/modifiers/groups/{modifierGroupId}/options:
 *   get:
 *     summary: List options for a modifier group
 *     tags:
 *       - Modifiers
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: modifierGroupId
 *         required: true
 *         schema:
 *           type: string
 *         description: Modifier group ID
 *     responses:
 *       200:
 *         description: List of modifier options
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not found
 */
modifierRouter.get(
  "/v1/menu/modifiers/groups/:modifierGroupId/options",
  authMiddleware.authenticate,
  validateParams(modifierGroupIdParamSchema),
  ModifierController.listOptionsForGroup
);

/**
 * @openapi
 * /v1/menu/modifiers/options/{optionId}:
 *   get:
 *     summary: Get a single modifier option
 *     tags:
 *       - Modifiers
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: optionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Modifier option ID
 *     responses:
 *       200:
 *         description: Modifier option found
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not found
 */
modifierRouter.get(
  "/v1/menu/modifiers/options/:optionId",
  authMiddleware.authenticate,
  validateParams(modifierOptionIdParamSchema),
  ModifierController.getOption
);

/**
 * @openapi
 * /v1/menu/modifiers/options/{optionId}:
 *   patch:
 *     summary: Update a modifier option
 *     tags:
 *       - Modifiers
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: optionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Modifier option ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               label:
 *                 type: string
 *                 description: Modifier option label
 *               priceAdjustmentUsd:
 *                 type: number
 *                 description: Price adjustment in USD
 *               isDefault:
 *                 type: boolean
 *                 description: Whether this option is the default
 *             additionalProperties: false
 *             minProperties: 1
 *             example:
 *               label: "Extra Cheese"
 *               priceAdjustmentUsd: 1.5
 *               isDefault: false
 *     responses:
 *       200:
 *         description: Modifier option updated
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not found
 */
modifierRouter.patch(
  "/v1/menu/modifiers/options/:optionId",
  authMiddleware.authenticate,
  validateParams(modifierOptionIdParamSchema),
  validateBody(updateModifierOptionSchema),
  ModifierController.updateOption
);

/**
 * @openapi
 * /v1/menu/modifiers/options/{optionId}:
 *   delete:
 *     summary: Soft delete a modifier option
 *     tags:
 *       - Modifiers
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: optionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Modifier option ID
 *     responses:
 *       200:
 *         description: Modifier option deleted
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not found
 */
modifierRouter.delete(
  "/v1/menu/modifiers/options/:optionId",
  authMiddleware.authenticate,
  validateParams(modifierOptionIdParamSchema),
  ModifierController.deleteOption
);

export { modifierRouter };
