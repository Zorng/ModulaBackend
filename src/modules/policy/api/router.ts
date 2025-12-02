import { Router } from "express";
import { authMiddleware } from "../../auth/index.js";
import { validateBody } from "../../../platform/http/middleware/validation.js";
import { PolicyController } from "./controller/policyController.js";
import {
  updateTaxPoliciesSchema,
  updateCurrencyPoliciesSchema,
  updateRoundingPoliciesSchema,
  updateInventoryPoliciesSchema,
  // TODO: Import updateCashSessionPoliciesSchema when cash module is ready
  // TODO: Import updateAttendancePoliciesSchema when attendance module is ready
} from "./schemas.js";

export const policyRouter = Router();

/**
 * @swagger
 * /v1/policies:
 *   get:
 *     summary: Get all tenant policies
 *     description: |
 *       Retrieves all policy settings for the tenant in a combined view.
 *       
 *       **Includes:**
 *       - Tax & Currency (VAT, FX rate, rounding)
 *       - Inventory Behavior (stock subtraction, expiry tracking)
 *       - Cash Sessions Control (session requirements, paid-out, refunds)
 *       - Attendance & Shifts (auto-attendance, shift approvals, check-in buffer)
 *     tags:
 *       - Policies
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: All policies retrieved successfully
 *       401:
 *         description: Unauthorized
 */
policyRouter.get(
  "/",
  (req, res, next) => authMiddleware.authenticate(req, res, next),
  PolicyController.getTenantPolicies
);

/**
 * @swagger
 * /v1/policies/sales:
 *   get:
 *     summary: Get sales policies (Tax & Currency)
 *     description: |
 *       Retrieves tax and currency settings for the tenant.
 *       
 *       **Settings include:**
 *       - Apply VAT (enabled/disabled, rate)
 *       - KHR per USD (exchange rate)
 *       - Rounding mode (nearest, up, down)
 *     tags:
 *       - Policies
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Sales policies retrieved successfully
 *       401:
 *         description: Unauthorized
 */
policyRouter.get(
  "/sales",
  (req, res, next) => authMiddleware.authenticate(req, res, next),
  PolicyController.getSalesPolicies
);

/**
 * @swagger
 * /v1/policies/inventory:
 *   get:
 *     summary: Get inventory policies
 *     description: |
 *       Retrieves inventory behavior settings.
 *       
 *       **Settings include:**
 *       - Subtract stock on sale (auto-deduction)
 *       - Expiry tracking (enabled/disabled)
 *     tags:
 *       - Policies
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Inventory policies retrieved successfully
 *       401:
 *         description: Unauthorized
 */
policyRouter.get(
  "/inventory",
  (req, res, next) => authMiddleware.authenticate(req, res, next),
  PolicyController.getInventoryPolicies
);

// TODO: Add /cash-sessions GET endpoint when cash module is ready
// TODO: Add /attendance GET endpoint when attendance module is ready

/**
 * @swagger
 * /v1/policies/tax:
 *   patch:
 *     summary: Update tax policies (VAT)
 *     description: |
 *       Updates VAT tax settings for the tenant.
 *       
 *       **Updatable fields:**
 *       - Apply VAT (enabled/disabled)
 *       - VAT rate percentage
 *     tags:
 *       - Policies
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               saleVatEnabled:
 *                 type: boolean
 *                 example: true
 *               saleVatRatePercent:
 *                 type: number
 *                 example: 10
 *                 minimum: 0
 *                 maximum: 100
 *     responses:
 *       200:
 *         description: Tax policies updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
policyRouter.patch(
  "/tax",
  (req, res, next) => authMiddleware.authenticate(req, res, next),
  validateBody(updateTaxPoliciesSchema),
  PolicyController.updateTaxPolicies
);

/**
 * @swagger
 * /v1/policies/currency:
 *   patch:
 *     summary: Update currency policies (FX rate)
 *     description: |
 *       Updates currency conversion rate.
 *       
 *       **Updatable fields:**
 *       - KHR per USD (exchange rate)
 *     tags:
 *       - Policies
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               saleFxRateKhrPerUsd:
 *                 type: number
 *                 example: 4100
 *                 minimum: 1000
 *                 maximum: 10000
 *     responses:
 *       200:
 *         description: Currency policies updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
policyRouter.patch(
  "/currency",
  (req, res, next) => authMiddleware.authenticate(req, res, next),
  validateBody(updateCurrencyPoliciesSchema),
  PolicyController.updateCurrencyPolicies
);

/**
 * @swagger
 * /v1/policies/rounding:
 *   patch:
 *     summary: Update rounding policies
 *     description: |
 *       Updates KHR rounding behavior for transactions.
 *       
 *       **Updatable fields:**
 *       - Enable/disable rounding
 *       - Rounding mode (nearest, up, down)
 *       - Rounding granularity (100 or 1000)
 *     tags:
 *       - Policies
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               saleKhrRoundingEnabled:
 *                 type: boolean
 *                 example: true
 *               saleKhrRoundingMode:
 *                 type: string
 *                 enum: [NEAREST, UP, DOWN]
 *                 example: NEAREST
 *               saleKhrRoundingGranularity:
 *                 type: string
 *                 enum: ["100", "1000"]
 *                 example: "100"
 *     responses:
 *       200:
 *         description: Rounding policies updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
policyRouter.patch(
  "/rounding",
  (req, res, next) => authMiddleware.authenticate(req, res, next),
  validateBody(updateRoundingPoliciesSchema),
  PolicyController.updateRoundingPolicies
);

/**
 * @swagger
 * /v1/policies/inventory:
 *   patch:
 *     summary: Update inventory policies
 *     description: |
 *       Updates inventory behavior settings.
 *       
 *       **Updatable fields:**
 *       - Subtract stock on sale (auto-deduction)
 *       - Expiry tracking (enabled/disabled)
 *     tags:
 *       - Policies
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inventoryAutoSubtractOnSale:
 *                 type: boolean
 *                 example: true
 *               inventoryExpiryTrackingEnabled:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Inventory policies updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
policyRouter.patch(
  "/inventory",
  (req, res, next) => authMiddleware.authenticate(req, res, next),
  validateBody(updateInventoryPoliciesSchema),
  PolicyController.updateInventoryPolicies
);

// TODO: Add /cash-sessions PATCH endpoint when cash module is ready
// TODO: Add /attendance PATCH endpoint when attendance module is ready
