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

/**
 * @openapi
 * /v1/menu/items/{menuItemId}/stock:
 *   post:
 *     summary: Link a menu item to a stock item
 *     tags:
 *       - StockIntegration
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
 *             $ref: '#/components/schemas/LinkStockInput'
 *     responses:
 *       201:
 *         description: Stock linked
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Menu item not found
 */
stockIntegrationRouter.post(
  "/v1/menu/items/:menuItemId/stock",
  authenticate,
  validateParams(menuItemIdParamSchema),
  validateBody(linkStockSchema),
  StockIntegrationController.linkStock
);

/**
 * @openapi
 * /v1/menu/stock/{mappingId}:
 *   delete:
 *     summary: Unlink a menu item from a stock item
 *     tags:
 *       - StockIntegration
 *     parameters:
 *       - in: path
 *         name: mappingId
 *         required: true
 *         schema:
 *           type: string
 *         description: Stock mapping ID
 *     responses:
 *       204:
 *         description: Stock mapping deleted
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Mapping not found
 */
stockIntegrationRouter.delete(
  "/v1/menu/stock/:mappingId",
  authenticate,
  validateParams(stockMappingIdParamSchema),
  StockIntegrationController.unlinkStock
);

export { stockIntegrationRouter };
