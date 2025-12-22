export type EmployeeRole = "ADMIN" | "MANAGER" | "CASHIER" | "CLERK";
export type EmployeeStatus = "ACTIVE" | "INVITED" | "DISABLED" | "ARCHIVED";

export interface InvitePreview {
  id: string;
  tenantId: string;
  branchId: string;
  role: EmployeeRole;
  phone: string;
  firstName: string;
  lastName: string;
  expiresAt: Date;
}

export interface InviteAcceptanceResult {
  employee: {
    id: string;
    account_id: string;
    tenant_id: string;
    phone: string;
    email?: string;
    password_hash: string;
    first_name: string;
    last_name: string;
    status: EmployeeStatus;
    created_at: Date;
    updated_at: Date;
  };
  branchId: string;
  role: EmployeeRole;
}

export interface InvitationPort {
  peekValidInvite(token: string): Promise<InvitePreview>;
  acceptInvite(params: {
    token: string;
    accountId: string;
    passwordHash: string;
  }): Promise<InviteAcceptanceResult>;
}
