export type EmployeeStatus = 'ACTIVE' | 'INVITED' | 'DISABLED';
export type EmployeeRole = 'ADMIN' | 'MANAGER' | 'CASHIER' | 'CLERK';
export type AccountStatus = 'ACTIVE' | 'DISABLED';
export type AuthActionType = 
  | 'AUTH_LOGIN_SUCCESS'
  | 'AUTH_LOGIN_FAILED'
  | 'AUTH_LOGOUT'
  | 'AUTH_INVITE_CREATED'
  | 'AUTH_INVITE_ACCEPTED'
  | 'AUTH_INVITE_REISSUED'
  | 'AUTH_INVITE_REVOKED'
  | 'AUTH_ROLE_CHANGED'
  | 'AUTH_BRANCH_TRANSFERRED'
  | 'AUTH_EMPLOYEE_DISABLED'
  | 'AUTH_NAME_EDITED_BY_ADMIN'
  | 'CREDENTIAL_CHANGE_REQUESTED'
  | 'CREDENTIAL_CHANGED';

export interface Tenant {
  id: string;
  name: string;
  business_type?: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface Branch {
  id: string;
  tenant_id: string;
  name: string;
  address?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Account {
  id: string;
  phone: string;
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

export interface ActivityLog {
  id: string;
  tenant_id: string;
  branch_id?: string;
  employee_id?: string;
  action_type: AuthActionType;
  resource_type?: string;
  resource_id?: string;
  details?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
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
