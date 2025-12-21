import { Router } from "express";
import type { AuthMiddlewarePort } from "../../../../platform/security/auth.js";
import { StaffManagementController } from "../controllers/staffManagement.controller.js";

function requireRole(auth: AuthMiddlewarePort, roles: string[]) {
  if (!auth.requireRole) {
    throw new Error("AuthMiddlewarePort.requireRole is required for this route");
  }
  return auth.requireRole(roles);
}

export function createStaffManagementRoutes(
  controller: StaffManagementController,
  authMiddleware: AuthMiddlewarePort
): Router {
  const router = Router();

  router.use(authMiddleware.authenticate);

  /**
   * @openapi
   * /v1/auth/invites:
   *   post:
   *     tags:
   *       - Invites
   *     summary: Create an employee invite (Admin only)
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: "#/components/schemas/CreateInviteRequest"
   *     responses:
   *       201:
   *         description: Invite created
   *         content:
   *           application/json:
   *             schema:
   *               $ref: "#/components/schemas/CreateInviteResponse"
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Admin role required
   *       422:
   *         description: Missing required fields
   *       409:
   *         description: Invite creation failed
   */
  router.post(
    "/invites",
    requireRole(authMiddleware, ["ADMIN"]),
    controller.createInvite
  );

  /**
   * @openapi
   * /v1/auth/invites/{inviteId}/resend:
   *   post:
   *     tags:
   *       - Invites
   *     summary: Resend an invite (Admin only)
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: inviteId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Invite reissued
   *         content:
   *           application/json:
   *             schema:
   *               $ref: "#/components/schemas/CreateInviteResponse"
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Admin role required
   *       409:
   *         description: Invite resend failed
   */
  router.post(
    "/invites/:inviteId/resend",
    requireRole(authMiddleware, ["ADMIN"]),
    controller.resendInvite
  );

  /**
   * @openapi
   * /v1/auth/invites/{inviteId}/revoke:
   *   post:
   *     tags:
   *       - Invites
   *     summary: Revoke an invite (Admin only)
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: inviteId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Invite revoked
   *         content:
   *           application/json:
   *             schema:
   *               $ref: "#/components/schemas/InviteResponse"
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Admin role required
   *       409:
   *         description: Invite revoke failed
   */
  router.post(
    "/invites/:inviteId/revoke",
    requireRole(authMiddleware, ["ADMIN"]),
    controller.revokeInvite
  );

  /**
   * @openapi
   * /v1/auth/users/{userId}/assign-branch:
   *   post:
   *     tags:
   *       - User Management
   *     summary: Assign an employee to a branch (Admin only)
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Employee ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: "#/components/schemas/AssignBranchRequest"
   *     responses:
   *       201:
   *         description: Branch assigned
   *         content:
   *           application/json:
   *             schema:
   *               $ref: "#/components/schemas/AssignmentResponse"
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Admin role required
   *       422:
   *         description: Missing branch_id or role
   *       409:
   *         description: Assignment failed
   */
  router.post(
    "/users/:userId/assign-branch",
    requireRole(authMiddleware, ["ADMIN"]),
    controller.assignBranch
  );

  /**
   * @openapi
   * /v1/auth/users/{userId}/role:
   *   post:
   *     tags:
   *       - User Management
   *     summary: Update an employee role in a branch (Admin only)
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Employee ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: "#/components/schemas/UpdateRoleRequest"
   *     responses:
   *       200:
   *         description: Role updated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: "#/components/schemas/AssignmentResponse"
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Admin role required
   *       422:
   *         description: Missing branch_id or role
   *       409:
   *         description: Role update failed
   */
  router.post(
    "/users/:userId/role",
    requireRole(authMiddleware, ["ADMIN"]),
    controller.updateRole
  );

  /**
   * @openapi
   * /v1/auth/users/{userId}/disable:
   *   post:
   *     tags:
   *       - User Management
   *     summary: Disable an employee (Admin only)
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Employee ID
   *     responses:
   *       200:
   *         description: Employee disabled
   *         content:
   *           application/json:
   *             schema:
   *               $ref: "#/components/schemas/EmployeeResponse"
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Admin role required
   *       409:
   *         description: Disable failed
   */
  router.post(
    "/users/:userId/disable",
    requireRole(authMiddleware, ["ADMIN"]),
    controller.disableEmployee
  );

  return router;
}
