import type { PoolClient } from "pg";
import type { BranchRecord } from "./branch.js";
import type { EmployeeRole, EmployeeStatus } from "./staff-management.js";

export type TenantStatus = "ACTIVE" | "PAST_DUE" | "EXPIRED" | "CANCELED";

export interface TenantRecord {
  id: string;
  name: string;
  business_type?: string | null;
  status: TenantStatus;
  logo_url?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  contact_address?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface TenantMetadata {
  id: string;
  name: string;
  logo_url?: string | null;
  status: TenantStatus;
}

export interface EmployeeRecord {
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

export interface PolicyDefaultsPort {
  ensureDefaultPolicies(tenantId: string): Promise<void>;
}

export interface MembershipProvisioningPort {
  createInitialAdminMembership(params: {
    client: PoolClient;
    accountId: string;
    tenantId: string;
    branchId: string;
    phone: string;
    firstName: string;
    lastName: string;
    passwordHash: string;
  }): Promise<{ employee: EmployeeRecord; role: EmployeeRole }>;
}

export interface TenantProvisioningPort {
  provisionTenant(params: {
    name: string;
    business_type?: string;
    accountId: string;
    phone: string;
    firstName: string;
    lastName: string;
    passwordHash: string;
  }): Promise<{
    tenant: TenantRecord;
    branch: BranchRecord;
    employee: EmployeeRecord;
    role: EmployeeRole;
  }>;
}

export interface TenantMetadataPort {
  getTenantMetadata(tenantId: string): Promise<TenantMetadata>;
}
