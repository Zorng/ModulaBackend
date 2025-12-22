export type BranchStatus = "ACTIVE" | "FROZEN";

export interface Branch {
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

export interface BranchProfileUpdate {
  name?: string;
  address?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
}

