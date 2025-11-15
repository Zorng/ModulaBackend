export type UserStatus = 'ACTIVE' | 'INVITED' | 'DISABLED';
export type UserRole = 'ADMIN' | 'MANAGER' | 'CASHIER' | 'CLERK';
export type AuthActionType = 
  | 'AUTH_INVITE_CREATED'
  | 'AUTH_INVITE_ACCEPTED'
  | 'AUTH_INVITE_REISSUED'
  | 'AUTH_INVITE_REVOKED'
  | 'AUTH_ROLE_CHANGED'
  | 'AUTH_BRANCH_TRANSFERRED'
  | 'AUTH_USER_DISABLED'
  | 'AUTH_NAME_EDITED_BY_ADMIN';

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

export interface User {
  id: string;
  tenant_id: string;
  phone: string;
  email?: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  status: UserStatus;
  created_at: Date;
  updated_at: Date;
}

export interface UserBranchAssignment {
  id: string;
  user_id: string;
  branch_id: string;
  role: UserRole;
  active: boolean;
  assigned_at: Date;
  branch_name?: string;
}

export interface Invite {
  id: string;
  tenant_id: string;
  branch_id: string;
  role: UserRole;
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
  user_id: string;
  refresh_token_hash: string;
  created_at: Date;
  revoked_at?: Date;
  expires_at: Date;
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
  user_id?: string;
  action_type: AuthActionType;
  resource_type?: string;
  resource_id?: string;
  details?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
}

export interface JWTClaims {
  userId: string;
  tenantId: string;
  branchId?: string;
  role: UserRole;
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
  role: UserRole;
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