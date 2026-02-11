import type { Response } from "express";
import type { AuthRequest } from "../../../../platform/security/auth.js";
import type { StaffManagementService } from "../../app/staffManagement.service.js";

export class StaffManagementController {
  constructor(private staffService: StaffManagementService) {}

  private isValidTime(value: string): boolean {
    return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value);
  }

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

  reactivateEmployee = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { userId } = req.params;
      const employee = await this.staffService.reactivateEmployee(
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
        error: "Failed to reactivate employee: " + (error as Error).message,
      });
    }
  };

  archiveEmployee = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { userId } = req.params;
      const employee = await this.staffService.archiveEmployee(
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
        error: "Failed to archive employee: " + (error as Error).message,
      });
    }
  };

  listStaff = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { tenantId, role, branchId: userBranchId } = req.user;
      const queryBranchId = req.query.branch_id;

      if (role === "MANAGER") {
        if (queryBranchId && queryBranchId !== userBranchId) {
          return res.status(403).json({ error: "Branch access denied" });
        }
      }

      const branchId =
        role === "MANAGER"
          ? userBranchId
          : typeof queryBranchId === "string"
            ? queryBranchId
            : undefined;

      const staff = await this.staffService.listStaff(tenantId, branchId);

      return res.json({ staff });
    } catch (error) {
      return res.status(409).json({
        error: "Failed to list staff: " + (error as Error).message,
      });
    }
  };

  setShiftSchedule = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { userId } = req.params;
      const { branch_id, schedule } = req.body ?? {};

      if (!branch_id || !Array.isArray(schedule)) {
        return res.status(422).json({
          error: "branch_id and schedule array are required",
        });
      }

      const normalized = schedule.map((entry: any) => ({
        day_of_week: entry.day_of_week,
        start_time: entry.start_time ?? null,
        end_time: entry.end_time ?? null,
        is_off: Boolean(entry.is_off),
      }));

      for (const entry of normalized) {
        if (
          typeof entry.day_of_week !== "number" ||
          entry.day_of_week < 0 ||
          entry.day_of_week > 6
        ) {
          return res.status(422).json({
            error: "day_of_week must be an integer between 0 and 6",
          });
        }
        if (!entry.is_off) {
          if (!entry.start_time || !entry.end_time) {
            return res.status(422).json({
              error: "start_time and end_time are required when is_off is false",
            });
          }
          if (!this.isValidTime(entry.start_time) || !this.isValidTime(entry.end_time)) {
            return res.status(422).json({
              error: "start_time and end_time must be HH:MM or HH:MM:SS",
            });
          }
        }
      }

      const assignments = await this.staffService.setShiftSchedule({
        tenantId: req.user.tenantId,
        employeeId: userId,
        branchId: branch_id,
        schedule: normalized,
        adminEmployeeId: req.user.employeeId,
      });

      return res.status(200).json({ assignments });
    } catch (error) {
      return res.status(409).json({
        error: "Failed to set shift schedule: " + (error as Error).message,
      });
    }
  };

  listShiftSchedule = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { userId } = req.params;
      const branchId = req.query.branch_id;

      if (!branchId || typeof branchId !== "string") {
        return res.status(422).json({ error: "branch_id is required" });
      }

      const schedule = await this.staffService.listShiftSchedule({
        tenantId: req.user.tenantId,
        employeeId: userId,
        branchId,
      });

      return res.json({ schedule });
    } catch (error) {
      return res.status(409).json({
        error: "Failed to list shift schedule: " + (error as Error).message,
      });
    }
  };
}
