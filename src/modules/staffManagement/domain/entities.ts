import type { BranchRecord } from "../../../shared/ports/branch.js";

export type EmployeeStatus = "ACTIVE" | "INVITED" | "DISABLED" | "ARCHIVED";
export type EmployeeRole = "ADMIN" | "MANAGER" | "CASHIER" | "CLERK";

export type Branch = BranchRecord;

export interface Employee {
  id: string;
  account_id: string;
  tenant_id: string;
  phone: string;
  email?: string;
  password_hash: string;
  default_branch_id?: string;
  last_branch_id?: string;
  first_name: string;
  last_name: string;
  status: EmployeeStatus;
  created_at: Date;
  updated_at: Date;
}

export interface EmployeeBranchAssignment {
  id: string;
  employee_id: string;
  branch_id: string;
  role: EmployeeRole;
  active: boolean;
  assigned_at: Date;
  branch_name?: string;
}

export interface Invite {
  id: string;
  tenant_id: string;
  branch_id: string;
  role: EmployeeRole;
  phone: string;
  token_hash: string;
  first_name: string;
  last_name: string;
  note?: string;
  expires_at: Date;
  accepted_at?: Date;
  revoked_at?: Date;
  created_at: Date;
}

export interface ActivityLog {
  id: string;
  tenant_id: string;
  branch_id?: string;
  employee_id?: string;
  action_type: string;
  resource_type?: string;
  resource_id?: string;
  details?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
}

export interface CreateInviteRequest {
  first_name: string;
  last_name: string;
  phone: string;
  role: EmployeeRole;
  branch_id: string;
  note?: string;
  expires_in_hours?: number;
}
