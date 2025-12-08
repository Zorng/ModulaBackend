import { describe, it, expect, beforeEach } from "@jest/globals";
import { RecordCashMovementUseCase } from "../app/record-cash-movement.usecase.js";
import type { CashPolicyService } from "../app/policy-service.js";
import type {
  CashSession,
  CashRegister,
  CashMovement,
  CashMovementType,
  CashMovementStatus,
} from "../domain/entities.js";
import type {
  CashSessionRepository,
  CashMovementRepository,
} from "../domain/repositories.js";

// Mock repositories
class MockCashSessionRepository implements CashSessionRepository {
  private sessions = new Map<string, CashSession>();

  async findById(id: string): Promise<CashSession | null> {
    return this.sessions.get(id) || null;
  }

  async findActiveByRegister(registerId: string): Promise<CashSession | null> {
    return (
      Array.from(this.sessions.values()).find(
        (s) => s.registerId === registerId && s.status === "OPEN"
      ) || null
    );
  }

  async findByBranch(branchId: string): Promise<CashSession[]> {
    return Array.from(this.sessions.values()).filter(
      (s) => s.branchId === branchId
    );
  }

  async save(
    session: Omit<CashSession, "id" | "createdAt" | "updatedAt">
  ): Promise<CashSession> {
    const newSession: CashSession = {
      id: `sess-${Date.now()}`,
      ...session,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.sessions.set(newSession.id, newSession);
    return newSession;
  }

  async update(
    id: string,
    updates: Partial<Omit<CashSession, "id" | "tenantId" | "createdAt">>
  ): Promise<CashSession | null> {
    const session = this.sessions.get(id);
    if (!session) return null;
    const updated = { ...session, ...updates, updatedAt: new Date() };
    this.sessions.set(id, updated);
    return updated;
  }

  seed(session: CashSession) {
    this.sessions.set(session.id, session);
  }
}

class MockCashMovementRepository implements CashMovementRepository {
  private movements = new Map<string, CashMovement>();

  async findById(id: string): Promise<CashMovement | null> {
    return this.movements.get(id) || null;
  }

  async findBySession(sessionId: string): Promise<CashMovement[]> {
    return Array.from(this.movements.values()).filter(
      (m) => m.sessionId === sessionId
    );
  }

  async findByType(
    sessionId: string,
    type: CashMovementType
  ): Promise<CashMovement[]> {
    return Array.from(this.movements.values()).filter(
      (m) => m.sessionId === sessionId && m.type === type
    );
  }

  async save(
    movement: Omit<CashMovement, "id" | "createdAt">
  ): Promise<CashMovement> {
    const newMovement: CashMovement = {
      id: `mov-${Date.now()}-${Math.random()}`,
      ...movement,
      createdAt: new Date(),
    };
    this.movements.set(newMovement.id, newMovement);
    return newMovement;
  }
}

// Mock Policy Service
class MockCashPolicyService implements CashPolicyService {
  private policies = {
    requireSessionForSales: true,
    allowPaidOut: true,
    requireRefundApproval: true,
    allowManualAdjustment: false,
  };

  setPolicies(policies: Partial<typeof this.policies>) {
    this.policies = { ...this.policies, ...policies };
  }

  async requireSessionForSales(tenantId: string): Promise<boolean> {
    return this.policies.requireSessionForSales;
  }

  async allowPaidOut(tenantId: string): Promise<boolean> {
    return this.policies.allowPaidOut;
  }

  async requireRefundApproval(tenantId: string): Promise<boolean> {
    return this.policies.requireRefundApproval;
  }

  async allowManualAdjustment(tenantId: string): Promise<boolean> {
    return this.policies.allowManualAdjustment;
  }

  async getPaidOutLimit(
    tenantId: string
  ): Promise<{ usd: number; khr: number }> {
    return { usd: 500, khr: 2000000 };
  }
}

// Mock Event Bus
const mockEventBus = {
  publishViaOutbox: async () => {},
};

// Mock Transaction Manager
const mockTxManager = {
  withTransaction: async (callback: (client: any) => Promise<void>) => {
    await callback(null);
  },
};

describe("Cash Policy Integration", () => {
  let sessionRepo: MockCashSessionRepository;
  let movementRepo: MockCashMovementRepository;
  let policyService: MockCashPolicyService;
  let recordMovementUseCase: RecordCashMovementUseCase;

  const testTenantId = "tenant-123";
  const testBranchId = "branch-123";
  const testRegisterId = "reg-123";
  const testUserId = "user-123";
  let sessionId: string;

  beforeEach(async () => {
    sessionRepo = new MockCashSessionRepository();
    movementRepo = new MockCashMovementRepository();
    policyService = new MockCashPolicyService();

    recordMovementUseCase = new RecordCashMovementUseCase(
      sessionRepo,
      movementRepo,
      mockEventBus,
      mockTxManager,
      policyService
    );

    // Create an open session
    const session = await sessionRepo.save({
      tenantId: testTenantId,
      branchId: testBranchId,
      registerId: testRegisterId,
      openedBy: testUserId,
      openedAt: new Date(),
      openingFloatUsd: 100,
      openingFloatKhr: 400000,
      status: "OPEN",
      expectedCashUsd: 100,
      expectedCashKhr: 400000,
      countedCashUsd: 0,
      countedCashKhr: 0,
      varianceUsd: 0,
      varianceKhr: 0,
    });
    sessionId = session.id;
  });

  describe("Policy: Allow Paid-Out", () => {
    it("should allow paid-out when policy is enabled", async () => {
      policyService.setPolicies({ allowPaidOut: true });

      const result = await recordMovementUseCase.execute({
        tenantId: testTenantId,
        branchId: testBranchId,
        registerId: testRegisterId,
        sessionId,
        actorId: testUserId,
        type: "PAID_OUT",
        amountUsd: 50,
        amountKhr: 200000,
        reason: "Office supplies",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe("PAID_OUT");
        expect(result.value.status).toBe("APPROVED");
      }
    });

    it("should reject paid-out when policy is disabled", async () => {
      policyService.setPolicies({ allowPaidOut: false });

      const result = await recordMovementUseCase.execute({
        tenantId: testTenantId,
        branchId: testBranchId,
        registerId: testRegisterId,
        sessionId,
        actorId: testUserId,
        type: "PAID_OUT",
        amountUsd: 50,
        amountKhr: 200000,
        reason: "Office supplies",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Paid-out operations are not allowed");
      }
    });

    it("should require approval for paid-out exceeding limit", async () => {
      policyService.setPolicies({ allowPaidOut: true });

      const result = await recordMovementUseCase.execute({
        tenantId: testTenantId,
        branchId: testBranchId,
        registerId: testRegisterId,
        sessionId,
        actorId: testUserId,
        type: "PAID_OUT",
        amountUsd: 600, // Exceeds $500 limit
        amountKhr: 200000,
        reason: "Large expense",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("exceeds limit");
      }
    });
  });

  describe("Policy: Require Refund Approval", () => {
    it("should create PENDING refund when policy requires approval", async () => {
      policyService.setPolicies({ requireRefundApproval: true });

      const result = await recordMovementUseCase.execute({
        tenantId: testTenantId,
        branchId: testBranchId,
        registerId: testRegisterId,
        sessionId,
        actorId: testUserId,
        type: "REFUND_CASH",
        amountUsd: 30,
        amountKhr: 120000,
        reason: "Customer refund",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe("PENDING");
      }

      // Verify session cash NOT updated for pending movement
      const session = await sessionRepo.findById(sessionId);
      expect(session?.expectedCashUsd).toBe(100); // Unchanged
    });

    it("should create APPROVED refund when policy does not require approval", async () => {
      policyService.setPolicies({ requireRefundApproval: false });

      const result = await recordMovementUseCase.execute({
        tenantId: testTenantId,
        branchId: testBranchId,
        registerId: testRegisterId,
        sessionId,
        actorId: testUserId,
        type: "REFUND_CASH",
        amountUsd: 30,
        amountKhr: 120000,
        reason: "Customer refund",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe("APPROVED");
      }

      // Verify session cash updated for approved movement
      const session = await sessionRepo.findById(sessionId);
      expect(session?.expectedCashUsd).toBe(70); // 100 - 30
    });
  });

  describe("Policy: Allow Manual Adjustment", () => {
    it("should reject manual adjustment when policy is disabled", async () => {
      policyService.setPolicies({ allowManualAdjustment: false });

      const result = await recordMovementUseCase.execute({
        tenantId: testTenantId,
        branchId: testBranchId,
        registerId: testRegisterId,
        sessionId,
        actorId: testUserId,
        type: "ADJUSTMENT",
        amountUsd: 10,
        amountKhr: 40000,
        reason: "Cash discrepancy correction",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Manual adjustments are not allowed");
      }
    });

    it("should allow manual adjustment when policy is enabled", async () => {
      policyService.setPolicies({ allowManualAdjustment: true });

      const result = await recordMovementUseCase.execute({
        tenantId: testTenantId,
        branchId: testBranchId,
        registerId: testRegisterId,
        sessionId,
        actorId: testUserId,
        type: "ADJUSTMENT",
        amountUsd: 10,
        amountKhr: 40000,
        reason: "Cash discrepancy correction",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe("ADJUSTMENT");
        expect(result.value.status).toBe("APPROVED");
      }
    });
  });

  describe("Policy Enforcement Edge Cases", () => {
    it("should always allow PAID_IN regardless of policies", async () => {
      // Even if all policies are restrictive, PAID_IN should work
      policyService.setPolicies({
        allowPaidOut: false,
        requireRefundApproval: true,
        allowManualAdjustment: false,
      });

      const result = await recordMovementUseCase.execute({
        tenantId: testTenantId,
        branchId: testBranchId,
        registerId: testRegisterId,
        sessionId,
        actorId: testUserId,
        type: "PAID_IN",
        amountUsd: 50,
        amountKhr: 200000,
        reason: "Additional float",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe("APPROVED");
      }
    });

    it("should honor explicit approval requirement even when policy allows", async () => {
      policyService.setPolicies({ requireRefundApproval: false });

      const result = await recordMovementUseCase.execute({
        tenantId: testTenantId,
        branchId: testBranchId,
        registerId: testRegisterId,
        sessionId,
        actorId: testUserId,
        type: "REFUND_CASH",
        amountUsd: 30,
        amountKhr: 120000,
        reason: "Customer refund",
        requiresApproval: true, // Explicit override
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe("PENDING");
      }
    });
  });
});
