import { Router } from "express";
import {
  authenticate,
  validateBody,
  validateParams,
} from "../../../../platform/http/middleware/index.js";
import { StockIntegrationController } from "../controller/index.js";
import {
  linkStockSchema,
  stockMappingIdParamSchema,
  menuItemIdParamSchema,
} from "../schemas/schemas.js";

const stockIntegrationRouter = Router();

// POST /v1/menu/items/:menuItemId/stock
stockIntegrationRouter.post(
  "/v1/menu/items/:menuItemId/stock",
  authenticate,
  validateParams(menuItemIdParamSchema),
  validateBody(linkStockSchema),
  StockIntegrationController.linkStock
);

// DELETE /v1/menu/stock/:mappingId
stockIntegrationRouter.delete(
  "/v1/menu/stock/:mappingId",
  authenticate,
  validateParams(stockMappingIdParamSchema),
  StockIntegrationController.unlinkStock
);

export { stockIntegrationRouter };
