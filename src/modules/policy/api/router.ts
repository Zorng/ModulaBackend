import { Router } from "express";
import { validateBody } from "../../../platform/http/middleware/validation.js";
import type { AuthMiddlewarePort } from "../../../platform/security/auth.js";
import { PolicyController } from "./controller/policyController.js";
import { requireAdmin, logPolicyChange } from "./middleware/policy.middleware.js";
import {
  updateTaxPoliciesSchema,
  updateCurrencyPoliciesSchema,
  updateRoundingPoliciesSchema,
  updateInventoryPoliciesSchema,
  updateCashSessionPoliciesSchema,
  updateAttendancePoliciesSchema,
} from "./schemas.js";

export function createPolicyRouter(authMiddleware: AuthMiddlewarePort) {
  const policyRouter = Router();

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
  authMiddleware.authenticate,
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
  authMiddleware.authenticate,
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
  authMiddleware.authenticate,
  PolicyController.getInventoryPolicies
);

/**
 * @swagger
 * /v1/policies/cash-sessions:
 *   get:
 *     summary: Get cash session policies
 *     description: |
 *       Retrieves cash session control settings.
 *
 *       **Settings include:**
 *       - Require session for sales
 *       - Allow paid out
 *       - Require refund approval
 *       - Allow manual adjustment
 *     tags:
 *       - Policies
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Cash session policies retrieved successfully
 *       401:
 *         description: Unauthorized
 */
policyRouter.get(
  "/cash-sessions",
  authMiddleware.authenticate,
  PolicyController.getCashSessionPolicies
);

/**
 * @swagger
 * /v1/policies/attendance:
 *   get:
 *     summary: Get attendance policies
 *     description: |
 *       Retrieves attendance and shift settings.
 *
 *       **Settings include:**
 *       - Auto attendance from cash session
 *       - Require out-of-shift approval
 *       - Check-in buffer
 *       - Allow manager edits
 *     tags:
 *       - Policies
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Attendance policies retrieved successfully
 *       401:
 *         description: Unauthorized
 */
policyRouter.get(
  "/attendance",
  authMiddleware.authenticate,
  PolicyController.getAttendancePolicies
);

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
  authMiddleware.authenticate,
  requireAdmin,
  logPolicyChange,
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
  authMiddleware.authenticate,
  requireAdmin,
  logPolicyChange,
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
  authMiddleware.authenticate,
  requireAdmin,
  logPolicyChange,
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
  authMiddleware.authenticate,
  requireAdmin,
  logPolicyChange,
  validateBody(updateInventoryPoliciesSchema),
  PolicyController.updateInventoryPolicies
);

/**
 * @swagger
 * /v1/policies/cash-sessions:
 *   patch:
 *     summary: Update cash session policies
 *     description: |
 *       Updates cash session control settings.
 *
 *       **Updatable fields:**
 *       - Require session for sales
 *       - Allow paid out
 *       - Require refund approval
 *       - Allow manual adjustment
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
 *               cashRequireSessionForSales:
 *                 type: boolean
 *                 example: true
 *               cashAllowPaidOut:
 *                 type: boolean
 *                 example: false
 *               cashRequireRefundApproval:
 *                 type: boolean
 *                 example: false
 *               cashAllowManualAdjustment:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Cash session policies updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
policyRouter.patch(
  "/cash-sessions",
  authMiddleware.authenticate,
  requireAdmin,
  logPolicyChange,
  validateBody(updateCashSessionPoliciesSchema),
  PolicyController.updateCashSessionPolicies
);

/**
 * @swagger
 * /v1/policies/attendance:
 *   patch:
 *     summary: Update attendance policies
 *     description: |
 *       Updates attendance and shift settings.
 *
 *       **Updatable fields:**
 *       - Auto attendance from cash session
 *       - Require out-of-shift approval
 *       - Check-in buffer
 *       - Allow manager edits
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
 *               attendanceAutoFromCashSession:
 *                 type: boolean
 *                 example: false
 *               attendanceRequireOutOfShiftApproval:
 *                 type: boolean
 *                 example: false
 *               attendanceEarlyCheckinBufferEnabled:
 *                 type: boolean
 *                 example: false
 *               attendanceCheckinBufferMinutes:
 *                 type: number
 *                 example: 15
 *               attendanceAllowManagerEdits:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Attendance policies updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
policyRouter.patch(
  "/attendance",
  authMiddleware.authenticate,
  requireAdmin,
  logPolicyChange,
  validateBody(updateAttendancePoliciesSchema),
  PolicyController.updateAttendancePolicies
);

// TODO: Add /cash-sessions PATCH endpoint when cash module is ready
// TODO: Add /attendance PATCH endpoint when attendance module is ready

  return policyRouter;
}
