import type { PoolClient } from "pg";

export type BranchStatus = "ACTIVE" | "FROZEN";

export interface BranchRecord {
  id: string;
  tenant_id: string;
  name: string;
  address?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  status: BranchStatus;
  created_at: Date;
  updated_at: Date;
}

export interface BranchProvisioningPort {
  provisionBranch(params: {
    client: PoolClient;
    tenantId: string;
    name: string;
    address?: string | null;
    contact_phone?: string | null;
    contact_email?: string | null;
  }): Promise<BranchRecord>;
}

export interface BranchQueryPort {
  getBranch(params: { tenantId: string; branchId: string }): Promise<BranchRecord>;
}

export interface BranchGuardPort {
  assertBranchActive(params: { tenantId: string; branchId: string }): Promise<void>;
}

