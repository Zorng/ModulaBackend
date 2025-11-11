// TODO: Define Tenant and Branch entities
// Example: Tenant, Branch, Staff

export interface Tenant {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Branch {
  id: string;
  tenantId: string;
  name: string;
  address?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Staff {
  id: string;
  tenantId: string;
  branchId: string;
  userId: string;
  role: string;
  createdAt: Date;
}
