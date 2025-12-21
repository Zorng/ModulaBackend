import { Router } from 'express';
import { SalesController } from '../controllers/sales.controller.js';
import { salesMiddleware } from '../middlewares/sales.middleware.js';
import type { AuthRequest, AuthMiddlewarePort } from "../../../../platform/security/auth.js";
import { validateRequest } from '../../../../platform/http/middlewares/validation.middleware.js';
import { 
  createSaleSchema, 
  addItemSchema, 
  preCheckoutSchema, 
  finalizeSaleSchema,
  updateFulfillmentBodySchema,
  voidSaleBodySchema,
  reopenSaleBodySchema,
  updateItemQuantitySchema,
  getSalesQuerySchema
} from '../dtos/sales.dtos.js';

/**
 * Sales Routes - RESTful API endpoints for sales operations
 * 
 * This file defines the HTTP routes for the sales module, including:
 * - Draft management and cart operations
 * - Checkout flow (pre-checkout and finalization)
 * - Fulfillment tracking
 * - Void/Reopen operations
 * - Sales queries and reporting
 * 
 * All routes are protected by authentication and sales-specific middleware.
 */

export function createSalesRoutes(controller: SalesController, authMiddleware: AuthMiddlewarePort): Router {
  const router = Router();

  // ==================== MIDDLEWARE ====================
  
  // Apply authentication to all sales routes
  router.use(authMiddleware.authenticate);
  
  // Apply sales-specific middleware (branch permissions, etc.)
  router.use(salesMiddleware);

  // ==================== DRAFT & CART MANAGEMENT ====================

  /**
   * @openapi
   * /v1/sales/drafts:
   *   post:
   *     tags:
   *       - Sales
   *     summary: Create a new draft sale
   *     description: |
   *       Initialize a new sale in draft state for cart operations.
   *       
   *       **Note:** The FX rate is automatically fetched from tenant policy settings.
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - clientUuid
   *               - saleType
   *             properties:
   *               clientUuid:
   *                 type: string
   *                 format: uuid
   *                 description: Client UUID for offline sync
   *               saleType:
   *                 type: string
   *                 enum: [dine_in, take_away, delivery]
   *     responses:
   *       201:
   *         description: Draft sale created successfully
   *       401:
   *         description: Unauthorized
   *       422:
   *         description: Validation error
   */
  router.post(
    '/drafts', 
    validateRequest(createSaleSchema),
    async (req, res) => await controller.createDraftSale(req as AuthRequest, res)
  );

  /**
   * @openapi
   * /v1/sales/drafts/{clientUuid}:
   *   get:
   *     tags:
   *       - Sales
   *     summary: Get or create draft sale by client UUID
   *     description: Retrieve existing draft or create new one for offline sync
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: clientUuid
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Draft sale retrieved or created
   *       401:
   *         description: Unauthorized
   */
  router.get(
    '/drafts/:clientUuid',
    async (req, res) => await controller.getOrCreateDraft(req as unknown as AuthRequest, res)
  );  // ==================== CART ITEM OPERATIONS ====================

  /**
   * @openapi
   * /v1/sales/{saleId}/items:
   *   post:
   *     tags:
   *       - Sales
   *     summary: Add item to sale cart
   *     description: Fetches menu item price from menu module (with branch-specific override if exists)
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: saleId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - menuItemId
   *               - quantity
   *             properties:
   *               menuItemId:
   *                 type: string
   *                 format: uuid
   *                 description: Menu item ID (price fetched from menu_branch_items or menu_items)
   *               quantity:
   *                 type: integer
   *                 minimum: 1
   *                 description: Quantity to add
   *               modifiers:
   *                 type: array
   *                 description: Optional modifiers with pricing
   *                 items:
   *                   type: object
   *     responses:
   *       200:
   *         description: Item added successfully with branch-specific pricing
   *       400:
   *         description: Menu item not found or not available for this branch
   *       401:
   *         description: Unauthorized
   */
  router.post(
    '/:saleId/items',
    validateRequest(addItemSchema),
    async (req, res) => await controller.addItem(req as AuthRequest, res)
  );

  /**
   * @openapi
   * /v1/sales/{saleId}/items/{itemId}/quantity:
   *   patch:
   *     tags:
   *       - Sales
   *     summary: Update item quantity
   *     description: Set quantity to 0 to remove item
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: saleId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *       - in: path
   *         name: itemId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - quantity
   *             properties:
   *               quantity:
   *                 type: integer
   *     responses:
   *       200:
   *         description: Quantity updated
   *       401:
   *         description: Unauthorized
   */
  router.patch(
    '/:saleId/items/:itemId/quantity',
    validateRequest(updateItemQuantitySchema),
    async (req, res) => await controller.updateItemQuantity(req as AuthRequest, res)
  );

  /**
   * @openapi
   * /v1/sales/{saleId}/items/{itemId}:
   *   delete:
   *     tags:
   *       - Sales
   *     summary: Remove item from cart
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: saleId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *       - in: path
   *         name: itemId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       204:
   *         description: Item removed
   *       401:
   *         description: Unauthorized
   */
  router.delete(
    '/:saleId/items/:itemId',
    async (req, res) => await controller.removeItem(req as unknown as AuthRequest, res)
  );

  // ==================== CHECKOUT FLOW ====================

  /**
   * @openapi
   * /v1/sales/{saleId}/pre-checkout:
   *   post:
   *     tags:
   *       - Sales
   *     summary: Pre-checkout preparation
   *     description: Prepare sale for checkout - applies discounts, VAT, and rounding
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: saleId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - tenderCurrency
   *               - paymentMethod
   *             properties:
   *               tenderCurrency:
   *                 type: string
   *                 enum: [KHR, USD]
   *               paymentMethod:
   *                 type: string
   *                 enum: [cash, qr, transfer, other]
   *               cashReceived:
   *                 type: object
   *                 properties:
   *                   khr:
   *                     type: number
   *                   usd:
   *                     type: number
   *     responses:
   *       200:
   *         description: Pre-checkout successful
   *       401:
   *         description: Unauthorized
   */
  router.post(
    '/:saleId/pre-checkout',
    validateRequest(preCheckoutSchema),
    async (req, res) => await controller.preCheckout(req as AuthRequest, res)
  );

  /**
   * @openapi
   * /v1/sales/{saleId}/finalize:
   *   post:
   *     tags:
   *       - Sales
   *     summary: Finalize sale
   *     description: Finalize the sale - makes it immutable and triggers side effects
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: saleId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       200:
   *         description: Sale finalized
   *       401:
   *         description: Unauthorized
   */
  router.post(
    '/:saleId/finalize',
    async (req, res) => await controller.finalizeSale(req as AuthRequest, res)
  );

  // ==================== FULFILLMENT OPERATIONS ====================

  /**
   * @openapi
   * /v1/sales/{saleId}/fulfillment:
   *   patch:
   *     tags:
   *       - Sales
   *     summary: Update fulfillment status
   *     description: Update fulfillment status (in_prep → ready → delivered)
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: saleId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - status
   *             properties:
   *               status:
   *                 type: string
   *                 enum: [in_prep, ready, delivered, cancelled]
   *     responses:
   *       200:
   *         description: Fulfillment status updated
   *       401:
   *         description: Unauthorized
   */
  router.patch(
    '/:saleId/fulfillment',
    validateRequest(updateFulfillmentBodySchema),
    async (req, res) => await controller.updateFulfillment(req as AuthRequest, res)
  );

  // ==================== SALE CORRECTION OPERATIONS ====================

  /**
   * @openapi
   * /v1/sales/{saleId}/void:
   *   post:
   *     tags:
   *       - Sales
   *     summary: Void a sale
   *     description: Void a finalized sale (same-day only)
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: saleId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - reason
   *             properties:
   *               reason:
   *                 type: string
   *                 description: Required for audit trail
   *     responses:
   *       200:
   *         description: Sale voided
   *       401:
   *         description: Unauthorized
   */
  router.post(
    '/:saleId/void',
    validateRequest(voidSaleBodySchema),
    async (req, res) => await controller.voidSale(req as AuthRequest, res)
  );

  /**
   * @openapi
   * /v1/sales/{saleId}:
   *   delete:
   *     tags:
   *       - Sales
   *     summary: Delete a draft sale
   *     description: Permanently delete a sale in draft state (not finalized)
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: saleId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       204:
   *         description: Draft sale deleted successfully
   *       400:
   *         description: Cannot delete non-draft sales
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Sale not found
   */
  router.delete(
    '/:saleId',
    async (req, res) => await controller.deleteSale(req as unknown as AuthRequest, res)
  );

  /**
   * @openapi
   * /v1/sales/{saleId}/reopen:
   *   post:
   *     tags:
   *       - Sales
   *     summary: Reopen a sale
   *     description: Reopen a finalized sale (same-day only, manager role required)
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: saleId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - reason
   *             properties:
   *               reason:
   *                 type: string
   *                 description: Required for audit trail
   *     responses:
   *       200:
   *         description: Sale reopened
   *       401:
   *         description: Unauthorized
   */
  router.post(
    '/:saleId/reopen',
    validateRequest(reopenSaleBodySchema),
    async (req, res) => await controller.reopenSale(req as AuthRequest, res)
  );

  // ==================== QUERY ENDPOINTS ====================

  /**
   * @openapi
   * /v1/sales/{saleId}:
   *   get:
   *     tags:
   *       - Sales
   *     summary: Get sale by ID
   *     description: Get a specific sale by ID with all items and details
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: saleId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Sale details
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Sale not found
   */
  router.get(
    '/:saleId',
    async (req, res) => await controller.getSale(req as unknown as AuthRequest, res)
  );

  /**
   * @openapi
   * /v1/sales:
   *   get:
   *     tags:
   *       - Sales
   *     summary: Get paginated sales
   *     description: Get paginated list of sales with filtering
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *         description: Filter by sale state
   *       - in: query
   *         name: saleType
   *         schema:
   *           type: string
   *           enum: [dine_in, take_away, delivery]
   *       - in: query
   *         name: startDate
   *         schema:
   *           type: string
   *           format: date-time
   *       - in: query
   *         name: endDate
   *         schema:
   *           type: string
   *           format: date-time
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 50
   *           maximum: 100
   *     responses:
   *       200:
   *         description: Paginated sales list
   *       401:
   *         description: Unauthorized
   */
  router.get(
    '/',
    validateRequest(getSalesQuerySchema),
    async (req, res) => await controller.getActiveSales(req as AuthRequest, res)
  );

  /**
   * @openapi
   * /v1/sales/branch/today:
   *   get:
   *     tags:
   *       - Sales
   *     summary: Get today's sales
   *     description: Get all sales for current branch today - useful for dashboards and real-time monitoring
   *     security:
   *       - BearerAuth: []
   *     responses:
   *       200:
   *         description: Today's sales
   *       401:
   *         description: Unauthorized
   */
  router.get(
    '/branch/today',
    async (req, res) => await controller.getTodaySales(req as AuthRequest, res)
  );

  return router;
}

export type SalesRouter = Router;
