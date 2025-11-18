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

// POST /v1/menu/modifiers/groups
modifierRouter.post(
  "/v1/menu/modifiers/groups",
  authenticate,
  validateBody(createModifierGroupSchema),
  ModifierController.createGroup
);

// POST /v1/menu/modifiers/options
modifierRouter.post(
  "/v1/menu/modifiers/options",
  authenticate,
  validateBody(addModifierOptionSchema),
  ModifierController.addOption
);

// POST /v1/menu/items/:menuItemId/modifiers
modifierRouter.post(
  "/v1/menu/items/:menuItemId/modifiers",
  authenticate,
  validateParams(menuItemIdParamSchema),
  validateBody(attachModifierSchema),
  ModifierController.attatchToItem
);

export { modifierRouter };
