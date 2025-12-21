import type { Response } from "express";
import type { AuthRequest } from "../../../../platform/security/auth.js";
import type { StaffManagementService } from "../../app/staffManagement.service.js";

export class StaffManagementController {
  constructor(private staffService: StaffManagementService) {}

  createInvite = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const {
        first_name,
        last_name,
        phone,
        role,
        branch_id,
        note,
        expires_in_hours,
      } = req.body;

      if (!first_name || !last_name || !phone || !role || !branch_id) {
        return res.status(422).json({
          error: "First name, last name, phone, role, and branch are required",
        });
      }

      const invite = await this.staffService.createInvite(
        req.user.tenantId,
        req.user.employeeId,
        { first_name, last_name, phone, role, branch_id, note, expires_in_hours }
      );

      return res.status(201).json({
        invite: {
          id: invite.id,
          first_name: invite.first_name,
          last_name: invite.last_name,
          phone: invite.phone,
          role: invite.role,
          branch_id: invite.branch_id,
          expires_at: invite.expires_at,
        },
        invite_token: invite.token_hash,
      });
    } catch (error) {
      return res.status(409).json({
        error: "Failed to create invite: " + (error as Error).message,
      });
    }
  };

  revokeInvite = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { inviteId } = req.params;
      const invite = await this.staffService.revokeInvite(
        req.user.tenantId,
        inviteId,
        req.user.employeeId
      );

      return res.json({ invite });
    } catch (error) {
      return res.status(409).json({
        error: "Failed to revoke invite: " + (error as Error).message,
      });
    }
  };

  resendInvite = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { inviteId } = req.params;
      const invite = await this.staffService.resendInvite(
        req.user.tenantId,
        inviteId,
        req.user.employeeId
      );

      return res.json({
        invite: {
          id: invite.id,
          first_name: invite.first_name,
          last_name: invite.last_name,
          phone: invite.phone,
          role: invite.role,
          branch_id: invite.branch_id,
          expires_at: invite.expires_at,
        },
        invite_token: invite.token_hash,
      });
    } catch (error) {
      return res.status(409).json({
        error: "Failed to resend invite: " + (error as Error).message,
      });
    }
  };

  assignBranch = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { userId } = req.params;
      const { branch_id, role } = req.body;

      if (!branch_id || !role) {
        return res.status(422).json({
          error: "Branch ID and role are required",
        });
      }

      const assignment = await this.staffService.assignBranch(
        req.user.tenantId,
        userId,
        branch_id,
        role,
        req.user.employeeId
      );

      return res.status(201).json({ assignment });
    } catch (error) {
      return res.status(409).json({
        error: "Failed to assign branch: " + (error as Error).message,
      });
    }
  };

  updateRole = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { userId } = req.params;
      const { branch_id, role } = req.body;

      if (!branch_id || !role) {
        return res.status(422).json({
          error: "Branch ID and role are required",
        });
      }

      const assignment = await this.staffService.updateRole(
        req.user.tenantId,
        userId,
        branch_id,
        role,
        req.user.employeeId
      );

      return res.json({ assignment });
    } catch (error) {
      return res.status(409).json({
        error: "Failed to update role: " + (error as Error).message,
      });
    }
  };

  disableEmployee = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { userId } = req.params;
      const employee = await this.staffService.disableEmployee(
        req.user.tenantId,
        userId,
        req.user.employeeId
      );

      return res.json({
        employee: {
          id: employee.id,
          first_name: employee.first_name,
          last_name: employee.last_name,
          phone: employee.phone,
          status: employee.status,
        },
      });
    } catch (error) {
      return res.status(409).json({
        error: "Failed to disable employee: " + (error as Error).message,
      });
    }
  };
}

