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

// PUT /v1/menu/items/:menuItemId/branches/availability
branchMenuRouter.put(
  "/v1/menu/items/:menuItemId/branches/availability",
  authenticate,
  validateParams(menuItemIdParamSchema),
  validateBody(setBranchAvailabilitySchema),
  BranchMenuController.setAvailability
);

// PUT /v1/menu/items/:menuItemId/branches/price
branchMenuRouter.put(
  "/v1/menu/items/:menuItemId/branches/price",
  authenticate,
  validateParams(menuItemIdParamSchema),
  validateBody(setBranchPriceSchema),
  BranchMenuController.setPriceOverride
);

export { branchMenuRouter };
