export type TenantStatus = "ACTIVE" | "PAST_DUE" | "EXPIRED" | "CANCELED";

export interface Tenant {
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

export interface TenantProfile extends Tenant {
  branch_count: number;
}

export interface TenantProfileUpdate {
  name?: string;
  contact_phone?: string | null;
  contact_email?: string | null;
  contact_address?: string | null;
}

export interface TenantMetadata {
  id: string;
  name: string;
  logo_url?: string | null;
  status: TenantStatus;
}

export interface Branch {
  id: string;
  tenant_id: string;
  name: string;
  address?: string | null;
  created_at: Date;
  updated_at: Date;
}
