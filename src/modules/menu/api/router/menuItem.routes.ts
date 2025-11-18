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

// POST /v1/menu/items
menuItemRouter.post(
  "/v1/menu/items",
  authenticate,
  validateBody(createMenuItemSchema),
  MenuItemController.create
);

// GET /v1/menu/items/:menuItemId
menuItemRouter.get(
  "/v1/menu/items/:menuItemId",
  authenticate,
  validateParams(menuItemIdParamSchema),
  MenuItemController.get
);

// PATCH /v1/menu/items/:menuItemId
menuItemRouter.patch(
  "/v1/menu/items/:menuItemId",
  authenticate,
  validateParams(menuItemIdParamSchema),
  validateBody(updateMenuItemSchema),
  MenuItemController.update
);

// DELETE /v1/menu/items/:menuItemId
menuItemRouter.delete(
  "/v1/menu/items/:menuItemId",
  authenticate,
  validateParams(menuItemIdParamSchema),
  MenuItemController.delete
);

export { menuItemRouter };
