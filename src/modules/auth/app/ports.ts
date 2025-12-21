export interface PolicyPort {
  ensureDefaultPolicies(tenantId: string): Promise<void>;
}

