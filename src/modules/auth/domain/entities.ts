export type EmployeeStatus = 'ACTIVE' | 'INVITED' | 'DISABLED' | 'ARCHIVED';
export type EmployeeRole = 'ADMIN' | 'MANAGER' | 'CASHIER' | 'CLERK';
export type AccountStatus = 'ACTIVE' | 'DISABLED';

export interface Tenant {
  id: string;
  name: string;
  business_type?: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface Account {
  id: string;
  phone: string;
  email?: string | null;
  password_hash: string;
  status: AccountStatus;
  phone_verified_at?: Date;
  created_at: Date;
  updated_at: Date;
}

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

export interface Session {
  id: string;
  employee_id: string;
  refresh_token_hash: string;
  created_at: Date;
  revoked_at?: Date;
  expires_at: Date;
}

export type PhoneOtpPurpose = "REGISTER_TENANT" | "FORGOT_PASSWORD";

export interface PhoneOtp {
  id: string;
  phone: string;
  purpose: PhoneOtpPurpose;
  code_hash: string;
  attempts: number;
  max_attempts: number;
  created_at: Date;
  expires_at: Date;
  consumed_at?: Date;
}

export interface AuthPolicy {
  id: string;
  tenant_id: string;
  branch_id?: string;
  type: string;
  data: Record<string, any>;
  version: number;
  effective_from: Date;
  created_at: Date;
}

export interface JWTClaims {
  employeeId: string;
  tenantId: string;
  branchId?: string;
  role: EmployeeRole;
  exp: number;
  iat: number;
}

export interface LoginCredentials {
  phone: string;
  password: string;
}

export interface RegisterTenantRequest {
  business_name: string;
  phone: string;
  first_name: string;
  last_name: string;
  password: string;
  business_type?: string;
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

export interface AcceptInviteRequest {
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
