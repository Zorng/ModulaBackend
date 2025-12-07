import { describe, it, expect, beforeEach } from "@jest/globals";
import { OpenCashSessionUseCase } from "../app/open-cash-sess.usecase.js";
import { CloseCashSessionUseCase } from "../app/close-cash-sess.js";
import { RecordCashMovementUseCase } from "../app/record-cash-movement.usecase.js";
import { GetActiveSessionUseCase } from "../app/get-active-session.usecase.js";
import { DefaultCashPolicyService } from "../app/policy-service.js";
import type {
  CashSession,
  CashRegister,
  CashMovement,
  CashRegisterStatus,
  CashSessionStatus,
  CashMovementType,
  CashMovementStatus,
} from "../domain/entities.js";
import type {
  CashSessionRepository,
  CashRegisterRepository,
  CashMovementRepository,
} from "../domain/repositories.js";

// Mock repositories
class MockCashRegisterRepository implements CashRegisterRepository {
  private registers = new Map<string, CashRegister>();

  async findById(id: string): Promise<CashRegister | null> {
    return this.registers.get(id) || null;
  }

  async findByBranch(branchId: string): Promise<CashRegister[]> {
    return Array.from(this.registers.values()).filter(
      (r) => r.branchId === branchId
    );
  }

  async findByTenant(tenantId: string): Promise<CashRegister[]> {
    return Array.from(this.registers.values()).filter(
      (r) => r.tenantId === tenantId
    );
  }

  async findByBranchAndName(
    branchId: string,
    name: string
  ): Promise<CashRegister | null> {
    return (
      Array.from(this.registers.values()).find(
        (r) => r.branchId === branchId && r.name.toLowerCase() === name.toLowerCase()
      ) || null
    );
  }

  async findByTenantAndBranch(
    tenantId: string,
    branchId: string
  ): Promise<CashRegister[]> {
    return Array.from(this.registers.values()).filter(
      (r) => r.tenantId === tenantId && r.branchId === branchId
    );
  }

  async findByTenantAndStatus(
    tenantId: string,
    status: "ACTIVE" | "INACTIVE"
  ): Promise<CashRegister[]> {
    return Array.from(this.registers.values()).filter(
      (r) => r.tenantId === tenantId && r.status === status
    );
  }

  async save(
    register: Omit<CashRegister, "id" | "createdAt" | "updatedAt">
  ): Promise<CashRegister> {
    const newRegister: CashRegister = {
      id: `reg-${Date.now()}`,
      ...register,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.registers.set(newRegister.id, newRegister);
    return newRegister;
  }

  async update(
    id: string,
    updates: Partial<Omit<CashRegister, "id" | "tenantId" | "createdAt">>
  ): Promise<CashRegister | null> {
    const register = this.registers.get(id);
    if (!register) return null;
    const updated = { ...register, ...updates, updatedAt: new Date() };
    this.registers.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.registers.delete(id);
  }

  seed(register: CashRegister) {
    this.registers.set(register.id, register);
  }
}

class MockCashSessionRepository implements CashSessionRepository {
  private sessions = new Map<string, CashSession>();

  async findById(id: string): Promise<CashSession | null> {
    return this.sessions.get(id) || null;
  }

  async findOpenByRegister(registerId: string): Promise<CashSession | null> {
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

  async findByRegister(registerId: string): Promise<CashSession[]> {
    return Array.from(this.sessions.values()).filter(
      (s) => s.registerId === registerId
    );
  }

  async findByTenantAndBranch(
    tenantId: string,
    branchId: string
  ): Promise<CashSession[]> {
    return Array.from(this.sessions.values()).filter(
      (s) => s.tenantId === tenantId && s.branchId === branchId
    );
  }

  async findByTenant(tenantId: string): Promise<CashSession[]> {
    return Array.from(this.sessions.values()).filter(
      (s) => s.tenantId === tenantId
    );
  }

  async findByStatus(status: CashSessionStatus): Promise<CashSession[]> {
    return Array.from(this.sessions.values()).filter(
      (s) => s.status === status
    );
  }

  async getSessionSummary(sessionId: string): Promise<{
    session: CashSession;
    totalMovements: number;
    totalCashIn: number;
    totalCashOut: number;
  } | null> {
    const session = await this.findById(sessionId);
    if (!session) return null;
    return {
      session,
      totalMovements: 0,
      totalCashIn: 0,
      totalCashOut: 0,
    };
  }

  async findByDateRange(fromDate: Date, toDate: Date): Promise<CashSession[]> {
    return Array.from(this.sessions.values()).filter(
      (s) => s.openedAt >= fromDate && s.openedAt <= toDate
    );
  }

  async save(
    session: Omit<CashSession, "id" | "createdAt" | "updatedAt">
  ): Promise<CashSession> {
    const newSession: CashSession = {
      id: `session-${Date.now()}`,
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

  async findByRegister(registerId: string): Promise<CashMovement[]> {
    return Array.from(this.movements.values()).filter(
      (m) => m.registerId === registerId
    );
  }

  async findByTenant(tenantId: string): Promise<CashMovement[]> {
    return Array.from(this.movements.values()).filter(
      (m) => m.tenantId === tenantId
    );
  }

  async findByBranch(branchId: string): Promise<CashMovement[]> {
    return Array.from(this.movements.values()).filter(
      (m) => m.branchId === branchId
    );
  }

  async findBySale(refSaleId: string): Promise<CashMovement[]> {
    return Array.from(this.movements.values()).filter(
      (m) => m.refSaleId === refSaleId
    );
  }

  async findByType(type: CashMovementType): Promise<CashMovement[]> {
    return Array.from(this.movements.values()).filter(
      (m) => m.type === type
    );
  }

  async findByStatus(status: CashMovementStatus): Promise<CashMovement[]> {
    return Array.from(this.movements.values()).filter(
      (m) => m.status === status
    );
  }

  async findByActor(actorId: string): Promise<CashMovement[]> {
    return Array.from(this.movements.values()).filter(
      (m) => m.actorId === actorId
    );
  }

  async findByDateRange(fromDate: Date, toDate: Date): Promise<CashMovement[]> {
    return Array.from(this.movements.values()).filter(
      (m) => m.createdAt >= fromDate && m.createdAt <= toDate
    );
  }

  async findPendingApprovals(): Promise<CashMovement[]> {
    return Array.from(this.movements.values()).filter(
      (m) => m.status === "PENDING"
    );
  }

  async getDailyMovements(
    tenantId: string,
    branchId: string,
    date: Date
  ): Promise<CashMovement[]> {
    return Array.from(this.movements.values()).filter(
      (m) => m.tenantId === tenantId && m.branchId === branchId
    );
  }

  async getMovementSummary(sessionId: string): Promise<{
    totalPaidIn: number;
    totalPaidOut: number;
    totalRefunds: number;
    totalAdjustments: number;
    netCashFlow: number;
  }> {
    const movements = await this.findBySession(sessionId);
    return {
      totalPaidIn: movements.filter(m => m.type === "PAID_IN").reduce((sum, m) => sum + m.amountUsd, 0),
      totalPaidOut: movements.filter(m => m.type === "PAID_OUT").reduce((sum, m) => sum + m.amountUsd, 0),
      totalRefunds: movements.filter(m => m.type === "REFUND_CASH").reduce((sum, m) => sum + m.amountUsd, 0),
      totalAdjustments: movements.filter(m => m.type === "ADJUSTMENT").reduce((sum, m) => sum + m.amountUsd, 0),
      netCashFlow: 0,
    };
  }

  async update(
    id: string,
    updates: Partial<Omit<CashMovement, "id" | "tenantId" | "createdAt">>
  ): Promise<CashMovement | null> {
    const movement = this.movements.get(id);
    if (!movement) return null;
    const updated = { ...movement, ...updates };
    this.movements.set(id, updated);
    return updated;
  }

  async save(
    movement: Omit<CashMovement, "id" | "createdAt">
  ): Promise<CashMovement> {
    const newMovement: CashMovement = {
      id: `movement-${Date.now()}`,
      ...movement,
      createdAt: new Date(),
    };
    this.movements.set(newMovement.id, newMovement);
    return newMovement;
  }
}

// Mock event bus and transaction manager
const mockEventBus = {
  publishViaOutbox: async () => {},
};

const mockTxManager = {
  withTransaction: async (fn: any) => {
    await fn(null);
  },
};

describe("Cash Module", () => {
  let registerRepo: MockCashRegisterRepository;
  let sessionRepo: MockCashSessionRepository;
  let movementRepo: MockCashMovementRepository;
  let openSessionUseCase: OpenCashSessionUseCase;
  let closeSessionUseCase: CloseCashSessionUseCase;
  let recordMovementUseCase: RecordCashMovementUseCase;
  let getActiveSessionUseCase: GetActiveSessionUseCase;
  let policyService: DefaultCashPolicyService;

  const testTenantId = "tenant-123";
  const testBranchId = "branch-123";
  const testRegisterId = "register-123";
  const testUserId = "user-123";

  beforeEach(() => {
    registerRepo = new MockCashRegisterRepository();
    sessionRepo = new MockCashSessionRepository();
    movementRepo = new MockCashMovementRepository();
    policyService = new DefaultCashPolicyService();

    openSessionUseCase = new OpenCashSessionUseCase(
      sessionRepo,
      registerRepo,
      mockEventBus,
      mockTxManager as any
    );

    closeSessionUseCase = new CloseCashSessionUseCase(
      sessionRepo,
      movementRepo,
      mockEventBus,
      mockTxManager as any
    );

    recordMovementUseCase = new RecordCashMovementUseCase(
      sessionRepo,
      movementRepo,
      mockEventBus,
      mockTxManager as any,
      policyService
    );

    getActiveSessionUseCase = new GetActiveSessionUseCase(
      sessionRepo,
      movementRepo
    );

    // Seed a test register
    registerRepo.seed({
      id: testRegisterId,
      tenantId: testTenantId,
      branchId: testBranchId,
      name: "Test Register",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  describe("Opening Cash Session", () => {
    it("should open a cash session successfully", async () => {
      const result = await openSessionUseCase.execute({
        tenantId: testTenantId,
        branchId: testBranchId,
        registerId: testRegisterId,
        openedBy: testUserId,
        openingFloatUsd: 100,
        openingFloatKhr: 400000,
        note: "Morning shift",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe("OPEN");
        expect(result.value.openingFloatUsd).toBe(100);
        expect(result.value.openingFloatKhr).toBe(400000);
        expect(result.value.expectedCashUsd).toBe(100);
        expect(result.value.expectedCashKhr).toBe(400000);
      }
    });

    it("should fail if register does not exist", async () => {
      const result = await openSessionUseCase.execute({
        tenantId: testTenantId,
        branchId: testBranchId,
        registerId: "non-existent",
        openedBy: testUserId,
        openingFloatUsd: 100,
        openingFloatKhr: 400000,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Register not found");
      }
    });

    it("should fail if register is not active", async () => {
      const inactiveRegisterId = "inactive-register";
      registerRepo.seed({
        id: inactiveRegisterId,
        tenantId: testTenantId,
        branchId: testBranchId,
        name: "Inactive Register",
        status: "INACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await openSessionUseCase.execute({
        tenantId: testTenantId,
        branchId: testBranchId,
        registerId: inactiveRegisterId,
        openedBy: testUserId,
        openingFloatUsd: 100,
        openingFloatKhr: 400000,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Register is not active");
      }
    });

    it("should fail if a session is already open", async () => {
      // Open first session
      await openSessionUseCase.execute({
        tenantId: testTenantId,
        branchId: testBranchId,
        registerId: testRegisterId,
        openedBy: testUserId,
        openingFloatUsd: 100,
        openingFloatKhr: 400000,
      });

      // Try to open another
      const result = await openSessionUseCase.execute({
        tenantId: testTenantId,
        branchId: testBranchId,
        registerId: testRegisterId,
        openedBy: testUserId,
        openingFloatUsd: 100,
        openingFloatKhr: 400000,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("already open");
      }
    });

    it("should fail with negative opening float", async () => {
      const result = await openSessionUseCase.execute({
        tenantId: testTenantId,
        branchId: testBranchId,
        registerId: testRegisterId,
        openedBy: testUserId,
        openingFloatUsd: -10,
        openingFloatKhr: 400000,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("negative");
      }
    });
  });

  describe("Closing Cash Session", () => {
    let sessionId: string;

    beforeEach(async () => {
      const result = await openSessionUseCase.execute({
        tenantId: testTenantId,
        branchId: testBranchId,
        registerId: testRegisterId,
        openedBy: testUserId,
        openingFloatUsd: 100,
        openingFloatKhr: 400000,
      });
      if (result.ok) {
        sessionId = result.value.id;
      }
    });

    it("should close a cash session successfully", async () => {
      const result = await closeSessionUseCase.execute({
        sessionId,
        closedBy: testUserId,
        countedCashUsd: 100,
        countedCashKhr: 400000,
        note: "End of shift",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe("CLOSED");
        expect(result.value.countedCashUsd).toBe(100);
        expect(result.value.varianceUsd).toBe(0);
        expect(result.value.varianceKhr).toBe(0);
      }
    });

    it("should calculate variance correctly", async () => {
      const result = await closeSessionUseCase.execute({
        sessionId,
        closedBy: testUserId,
        countedCashUsd: 95, // $5 short
        countedCashKhr: 390000, // 10,000 KHR short
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.varianceUsd).toBe(-5);
        expect(result.value.varianceKhr).toBe(-10000);
      }
    });

    it("should mark as PENDING_REVIEW if variance exceeds threshold", async () => {
      const result = await closeSessionUseCase.execute({
        sessionId,
        closedBy: testUserId,
        countedCashUsd: 90, // $10 short (exceeds $5 threshold)
        countedCashKhr: 400000,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe("PENDING_REVIEW");
      }
    });

    it("should fail with negative counted amounts", async () => {
      const result = await closeSessionUseCase.execute({
        sessionId,
        closedBy: testUserId,
        countedCashUsd: -10,
        countedCashKhr: 400000,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("negative");
      }
    });

    it("should fail if session does not exist", async () => {
      const result = await closeSessionUseCase.execute({
        sessionId: "non-existent",
        closedBy: testUserId,
        countedCashUsd: 100,
        countedCashKhr: 400000,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Session not found");
      }
    });

    it("should fail if session is not open", async () => {
      // Close the session first
      await closeSessionUseCase.execute({
        sessionId,
        closedBy: testUserId,
        countedCashUsd: 100,
        countedCashKhr: 400000,
      });

      // Try to close again
      const result = await closeSessionUseCase.execute({
        sessionId,
        closedBy: testUserId,
        countedCashUsd: 100,
        countedCashKhr: 400000,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("not open");
      }
    });
  });

  describe("Recording Cash Movements", () => {
    let sessionId: string;

    beforeEach(async () => {
      const result = await openSessionUseCase.execute({
        tenantId: testTenantId,
        branchId: testBranchId,
        registerId: testRegisterId,
        openedBy: testUserId,
        openingFloatUsd: 100,
        openingFloatKhr: 400000,
      });
      if (result.ok) {
        sessionId = result.value.id;
      }
    });

    it("should record PAID_IN movement successfully", async () => {
      const result = await recordMovementUseCase.execute({
        tenantId: testTenantId,
        branchId: testBranchId,
        registerId: testRegisterId,
        sessionId,
        actorId: testUserId,
        type: "PAID_IN",
        amountUsd: 50,
        amountKhr: 200000,
        reason: "Additional change from bank",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe("PAID_IN");
        expect(result.value.amountUsd).toBe(50);
        expect(result.value.status).toBe("APPROVED");
      }

      // Verify session expected cash updated
      const session = await sessionRepo.findById(sessionId);
      expect(session?.expectedCashUsd).toBe(150); // 100 + 50
      expect(session?.expectedCashKhr).toBe(600000); // 400000 + 200000
    });

    it("should record PAID_OUT movement successfully", async () => {
      const result = await recordMovementUseCase.execute({
        tenantId: testTenantId,
        branchId: testBranchId,
        registerId: testRegisterId,
        sessionId,
        actorId: testUserId,
        type: "PAID_OUT",
        amountUsd: 20,
        amountKhr: 80000,
        reason: "Petty cash for supplies",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe("PAID_OUT");
        expect(result.value.amountUsd).toBe(20);
      }

      // Verify session expected cash updated
      const session = await sessionRepo.findById(sessionId);
      expect(session?.expectedCashUsd).toBe(80); // 100 - 20
      expect(session?.expectedCashKhr).toBe(320000); // 400000 - 80000
    });

    it("should fail with invalid reason length", async () => {
      const result = await recordMovementUseCase.execute({
        tenantId: testTenantId,
        branchId: testBranchId,
        registerId: testRegisterId,
        sessionId,
        actorId: testUserId,
        type: "PAID_OUT",
        amountUsd: 20,
        amountKhr: 80000,
        reason: "ab", // Too short
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("3 and 120 characters");
      }
    });

    it("should fail with negative amounts", async () => {
      const result = await recordMovementUseCase.execute({
        tenantId: testTenantId,
        branchId: testBranchId,
        registerId: testRegisterId,
        sessionId,
        actorId: testUserId,
        type: "PAID_IN",
        amountUsd: -10,
        amountKhr: 80000,
        reason: "Invalid negative amount",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("negative");
      }
    });

    it("should fail if session is not open", async () => {
      // Close the session
      await closeSessionUseCase.execute({
        sessionId,
        closedBy: testUserId,
        countedCashUsd: 100,
        countedCashKhr: 400000,
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
        reason: "Should fail - session closed",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("not open");
      }
    });

    it("should create PENDING movement when requires approval", async () => {
      const result = await recordMovementUseCase.execute({
        tenantId: testTenantId,
        branchId: testBranchId,
        registerId: testRegisterId,
        sessionId,
        actorId: testUserId,
        type: "PAID_OUT",
        amountUsd: 500, // Large amount
        amountKhr: 2000000,
        reason: "Large withdrawal requiring approval",
        requiresApproval: true,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe("PENDING");
      }

      // Verify session expected cash NOT updated for pending
      const session = await sessionRepo.findById(sessionId);
      expect(session?.expectedCashUsd).toBe(100); // Should remain unchanged
    });
  });

  describe("Getting Active Session", () => {
    it("should get active session with movements", async () => {
      // Open session
      const openResult = await openSessionUseCase.execute({
        tenantId: testTenantId,
        branchId: testBranchId,
        registerId: testRegisterId,
        openedBy: testUserId,
        openingFloatUsd: 100,
        openingFloatKhr: 400000,
      });

      expect(openResult.ok).toBe(true);
      const sessionId = openResult.ok ? openResult.value.id : "";

      // Add a movement
      await recordMovementUseCase.execute({
        tenantId: testTenantId,
        branchId: testBranchId,
        registerId: testRegisterId,
        sessionId,
        actorId: testUserId,
        type: "PAID_IN",
        amountUsd: 50,
        amountKhr: 200000,
        reason: "Test movement",
      });

      // Get active session
      const result = await getActiveSessionUseCase.execute({
        registerId: testRegisterId,
      });

      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.id).toBe(sessionId);
        expect(result.value.movements).toBeDefined();
        expect(result.value.movements!.length).toBe(1);
        expect(result.value.movements![0].type).toBe("PAID_IN");
      }
    });

    it("should return null if no active session", async () => {
      const result = await getActiveSessionUseCase.execute({
        registerId: testRegisterId,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });
  });
});
