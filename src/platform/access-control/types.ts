import type { Pool, PoolClient } from "pg";

export type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type AccessControlScope = "GLOBAL" | "ACCOUNT" | "TENANT" | "BRANCH";
export type AccessControlEffect = "READ" | "WRITE";
export type RoleKey = "OWNER" | "ADMIN" | "MANAGER" | "CASHIER" | "CLERK";

export type TenantSource = "token" | "body.tenantId" | "path.membershipId";
export type BranchSource = "token" | "body.branchId" | "path.branchId";

export type OpenRoute = {
  method: string;
  pattern: RegExp;
};

export type ProtectedRoute = {
  method: string;
  pattern: RegExp;
  actionKey: string;
  tenantSource?: TenantSource;
  branchSource?: BranchSource;
};

export type ActionMetadata = {
  scope: AccessControlScope;
  effect: AccessControlEffect;
  allowedRoles?: RoleKey[];
  entitlementKey?: string;
};

export type V0Claims = {
  accountId: string;
  sid?: string | null;
  scope?: string;
  tenantId?: string | null;
  branchId?: string | null;
};
