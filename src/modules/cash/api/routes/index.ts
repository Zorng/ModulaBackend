import { Router } from "express";
import {
  SessionController,
  MovementController,
  ReportController,
  RegisterController,
} from "../controller/index.js";
import type { AuthMiddlewarePort } from "../../../../platform/security/auth.js";
import { requireActiveBranch } from "../../../../platform/http/middlewares/branch-guard.middleware.js";
import { pool } from "#db";

async function resolveBranchIdForSession(req: any): Promise<string | undefined> {
  const sessionId = req.params?.sessionId;
  if (typeof sessionId !== "string" || sessionId.length === 0) return undefined;
  const result = await pool.query(
    "SELECT branch_id FROM cash_sessions WHERE id = $1",
    [sessionId]
  );
  return result.rows.length ? (result.rows[0].branch_id as string) : undefined;
}

/**
 * Cash Module Routes
 *
 * Endpoints for cash session management, movements, and reporting
 */

export function createCashRoutes(
  sessionController: SessionController,
  movementController: MovementController,
  reportController: ReportController,
  registerController: RegisterController,
  authMiddleware: AuthMiddlewarePort
): Router {
  const router = Router();

  // Apply authentication to all routes
  router.use(authMiddleware.authenticate);

  // ==================== REGISTER MANAGEMENT ====================

  /**
   * @openapi
   * /v1/cash/registers:
   *   post:
   *     tags:
   *       - Cash
   *     summary: Create a new register (Manager/Admin only)
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - name
   *             properties:
   *               branchId:
   *                 type: string
   *                 format: uuid
   *                 description: Branch ID (optional - defaults to user's branch)
   *               name:
   *                 type: string
   *                 minLength: 2
   *                 maxLength: 100
   *                 description: Register name (e.g., "Front Counter")
   *     responses:
   *       201:
   *         description: Register created successfully
   *       403:
   *         description: Forbidden - Manager/Admin only
   */
  router.post(
    "/registers",
    async (req, res) => await registerController.createRegister(req as any, res)
  );

  /**
   * @openapi
   * /v1/cash/registers:
   *   get:
   *     tags:
   *       - Cash
   *     summary: List all registers for current branch
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: query
   *         name: includeInactive
   *         schema:
   *           type: boolean
   *         description: Include inactive registers
   *     responses:
   *       200:
   *         description: List of registers
   */
  router.get(
    "/registers",
    async (req, res) => await registerController.listRegisters(req as any, res)
  );

  /**
   * @openapi
   * /v1/cash/registers/{registerId}:
   *   patch:
   *     tags:
   *       - Cash
   *     summary: Update a register (Manager/Admin only)
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: registerId
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
   *             properties:
   *               name:
   *                 type: string
   *               status:
   *                 type: string
   *                 enum: [ACTIVE, INACTIVE]
   *     responses:
   *       200:
   *         description: Register updated successfully
   *       403:
   *         description: Forbidden - Manager/Admin only
   */
  router.patch(
    "/registers/:registerId",
    async (req, res) => await registerController.updateRegister(req as any, res)
  );

  /**
   * @openapi
   * /v1/cash/registers/{registerId}:
   *   delete:
   *     tags:
   *       - Cash
   *     summary: Delete/deactivate a register (Manager/Admin only)
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: registerId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       204:
   *         description: Register deleted successfully
   *       403:
   *         description: Forbidden - Manager/Admin only
   */
  router.delete(
    "/registers/:registerId",
    async (req, res) => await registerController.deleteRegister(req as any, res)
  );

  // ==================== SESSION MANAGEMENT ====================

  /**
   * @openapi
   * /v1/cash/sessions:
   *   post:
   *     tags:
   *       - Cash
   *     summary: Open a new cash session
   *     description: Start a new cash session for a register with opening float
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - openingFloatUsd
   *               - openingFloatKhr
   *             properties:
   *               branchId:
   *                 type: string
   *                 format: uuid
   *                 description: Branch ID (optional - defaults to user's branch)
   *               registerId:
   *                 type: string
   *                 format: uuid
   *                 description: Register ID (optional - omit for device-agnostic sessions)
   *               openingFloatUsd:
   *                 type: number
   *                 minimum: 0
   *                 description: Opening float in USD
   *               openingFloatKhr:
   *                 type: number
   *                 minimum: 0
   *                 description: Opening float in KHR
   *               note:
   *                 type: string
   *                 maxLength: 500
   *                 description: Optional note
   *     responses:
   *       201:
   *         description: Session opened successfully
   *       400:
   *         description: Bad request (e.g., session already open)
   *       401:
   *         description: Unauthorized
   */
  router.post(
    "/sessions",
    requireActiveBranch({
      operation: "cash.open_session",
      resolveBranchId: (req) =>
        typeof req.body?.branchId === "string" ? req.body.branchId : undefined,
    }),
    async (req, res) => await sessionController.openSession(req as any, res)
  );

  /**
   * @openapi
   * /v1/cash/sessions/take-over:
   *   post:
   *     tags:
   *       - Cash
   *     summary: Take over an open session (Manager/Admin)
   *     description: Close previous session and open new one (manager approval)
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - reason
   *               - openingFloatUsd
   *               - openingFloatKhr
   *             properties:
   *               branchId:
   *                 type: string
   *                 format: uuid
   *                 description: Branch ID (optional - defaults to user's branch)
   *               registerId:
   *                 type: string
   *                 format: uuid
   *                 description: Register ID (optional - omit for device-agnostic sessions)
   *               reason:
   *                 type: string
   *                 minLength: 3
   *                 maxLength: 500
   *                 description: Reason for taking over
   *               openingFloatUsd:
   *                 type: number
   *                 minimum: 0
   *               openingFloatKhr:
   *                 type: number
   *                 minimum: 0
   *     responses:
   *       201:
   *         description: Session taken over successfully
   *       400:
   *         description: Bad request
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Insufficient permissions
   */
  router.post(
    "/sessions/take-over",
    requireActiveBranch({
      operation: "cash.take_over_session",
      resolveBranchId: (req) =>
        typeof req.body?.branchId === "string" ? req.body.branchId : undefined,
    }),
    async (req, res) => await sessionController.takeOverSession(req as any, res)
  );

  /**
   * @openapi
   * /v1/cash/sessions/{sessionId}/close:
   *   post:
   *     tags:
   *       - Cash
   *     summary: Close a cash session
   *     description: Close session with counted cash and calculate variance
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: sessionId
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
   *               - countedCashUsd
   *               - countedCashKhr
   *             properties:
   *               countedCashUsd:
   *                 type: number
   *                 minimum: 0
   *                 description: Actual counted cash in USD
   *               countedCashKhr:
   *                 type: number
   *                 minimum: 0
   *                 description: Actual counted cash in KHR
   *               note:
   *                 type: string
   *                 maxLength: 500
   *     responses:
   *       200:
   *         description: Session closed successfully
   *       400:
   *         description: Bad request
   *       401:
   *         description: Unauthorized
   */
  router.post(
    "/sessions/:sessionId/close",
    requireActiveBranch({
      operation: "cash.close_session",
      resolveBranchId: resolveBranchIdForSession,
    }),
    async (req, res) => await sessionController.closeSession(req as any, res)
  );

  /**
   * @openapi
   * /v1/cash/sessions/active:
   *   get:
   *     tags:
   *       - Cash
   *     summary: Get active session for register
   *     description: Retrieve the currently open session for a register
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: query
   *         name: branchId
   *         required: false
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Branch ID (optional - defaults to user's branch)
   *       - in: query
   *         name: registerId
   *         required: false
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Register ID (optional - omit for device-agnostic sessions)
   *     responses:
   *       200:
   *         description: Active session found
   *       404:
   *         description: No active session
   *       401:
   *         description: Unauthorized
   */
  router.get(
    "/sessions/active",
    async (req, res) =>
      await sessionController.getActiveSession(req as any, res)
  );

  // ==================== CASH MOVEMENTS ====================

  /**
   * @openapi
   * /v1/cash/sessions/{sessionId}/movements:
   *   post:
   *     tags:
   *       - Cash
   *     summary: Record manual cash movement
   *     description: Record Paid In, Paid Out, or Adjustment
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: sessionId
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
   *               - type
   *               - amountUsd
   *               - amountKhr
   *               - reason
   *             properties:
   *               branchId:
   *                 type: string
   *                 format: uuid
   *                 description: Branch ID (optional - defaults to user's branch)
   *               registerId:
   *                 type: string
   *                 format: uuid
   *                 description: Register ID (optional - omit for device-agnostic sessions)
   *               type:
   *                 type: string
   *                 enum: [PAID_IN, PAID_OUT, ADJUSTMENT]
   *               amountUsd:
   *                 type: number
   *                 minimum: 0
   *               amountKhr:
   *                 type: number
   *                 minimum: 0
   *               reason:
   *                 type: string
   *                 minLength: 3
   *                 maxLength: 120
   *     responses:
   *       201:
   *         description: Movement recorded successfully
   *       400:
   *         description: Bad request
   *       401:
   *         description: Unauthorized
   */
  router.post(
    "/sessions/:sessionId/movements",
    requireActiveBranch({
      operation: "cash.record_movement",
      resolveBranchId: resolveBranchIdForSession,
    }),
    async (req, res) => await movementController.recordMovement(req as any, res)
  );

  // ==================== REPORTS ====================

  /**
   * @openapi
   * /v1/cash/sessions/reports/z/{sessionId}:
   *   get:
   *     tags:
   *       - Cash
   *     summary: Get Z Report
   *     description: Generate closure summary for a session
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: sessionId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Z Report generated
   *       400:
   *         description: Bad request
   *       401:
   *         description: Unauthorized
   */
  router.get(
    "/sessions/reports/z/:sessionId",
    async (req, res) => await reportController.getZReport(req as any, res)
  );

  /**
   * @openapi
   * /v1/cash/sessions/reports/x:
   *   get:
   *     tags:
   *       - Cash
   *     summary: Get X Report
   *     description: Generate live summary for active session
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: query
   *         name: registerId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: X Report generated
   *       404:
   *         description: No active session
   *       401:
   *         description: Unauthorized
   */
  router.get(
    "/sessions/reports/x",
    async (req, res) => await reportController.getXReport(req as any, res)
  );

  return router;
}
