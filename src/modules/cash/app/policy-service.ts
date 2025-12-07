// Policy service adapter for cash module
// Provides cash-specific policy checking capabilities

import type { IPolicyRepository } from "../../policy/infra/repository.js";

export interface CashPolicyService {
  requireSessionForSales(tenantId: string): Promise<boolean>;
  allowPaidOut(tenantId: string): Promise<boolean>;
  requireRefundApproval(tenantId: string): Promise<boolean>;
  allowManualAdjustment(tenantId: string): Promise<boolean>;
  getPaidOutLimit(tenantId: string): Promise<{ usd: number; khr: number }>;
}

/**
 * Real policy service that queries the policy repository
 */
export class PolicyBasedCashPolicyService implements CashPolicyService {
  constructor(private policyRepo: IPolicyRepository) {}

  async requireSessionForSales(tenantId: string): Promise<boolean> {
    const policies = await this.policyRepo.getCashSessionPolicies(tenantId);
    return policies?.requireSessionForSales ?? true; // Default to true for security
  }

  async allowPaidOut(tenantId: string): Promise<boolean> {
    const policies = await this.policyRepo.getCashSessionPolicies(tenantId);
    return policies?.allowPaidOut ?? true;
  }

  async requireRefundApproval(tenantId: string): Promise<boolean> {
    const policies = await this.policyRepo.getCashSessionPolicies(tenantId);
    return policies?.requireRefundApproval ?? true; // Default to true for security
  }

  async allowManualAdjustment(tenantId: string): Promise<boolean> {
    const policies = await this.policyRepo.getCashSessionPolicies(tenantId);
    return policies?.allowManualAdjustment ?? false; // Default to false for security
  }

  async getPaidOutLimit(
    tenantId: string
  ): Promise<{ usd: number; khr: number }> {
    // Default limits - can be made configurable in policy table later
    return {
      usd: 500,
      khr: 2000000,
    };
  }
}

/**
 * Default policy service for testing or when policy module is unavailable
 */
export class DefaultCashPolicyService implements CashPolicyService {
  private readonly defaults = {
    requireSessionForSales: true,
    allowPaidOut: true,
    requireRefundApproval: true,
    allowManualAdjustment: false,
    paidOutLimitUsd: 500,
    paidOutLimitKhr: 2000000,
  };

  async requireSessionForSales(tenantId: string): Promise<boolean> {
    return this.defaults.requireSessionForSales;
  }

  async allowPaidOut(tenantId: string): Promise<boolean> {
    return this.defaults.allowPaidOut;
  }

  async requireRefundApproval(tenantId: string): Promise<boolean> {
    return this.defaults.requireRefundApproval;
  }

  async allowManualAdjustment(tenantId: string): Promise<boolean> {
    return this.defaults.allowManualAdjustment;
  }

  async getPaidOutLimit(
    tenantId: string
  ): Promise<{ usd: number; khr: number }> {
    return {
      usd: this.defaults.paidOutLimitUsd,
      khr: this.defaults.paidOutLimitKhr,
    };
  }
}
