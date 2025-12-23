export interface PolicyPort {
  ensureDefaultPolicies(tenantId: string, branchId: string): Promise<void>;
}
