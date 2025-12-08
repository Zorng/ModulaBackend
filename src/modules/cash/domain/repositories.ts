// Repository ports (interfaces) for Cash domain
// These define the contracts for data access, implemented in infra/

import {
  CashRegister,
  CashSession,
  CashMovement,
  CashRegisterStatus,
  CashSessionStatus,
  CashMovementType,
  CashMovementStatus,
} from "./entities.js";

export interface CashRegisterRepository {
  findById(id: string): Promise<CashRegister | null>;
  findByTenant(tenantId: string): Promise<CashRegister[]>;
  findByBranch(branchId: string): Promise<CashRegister[]>;
  findByBranchAndName(
    branchId: string,
    name: string
  ): Promise<CashRegister | null>;
  findByTenantAndBranch(
    tenantId: string,
    branchId: string
  ): Promise<CashRegister[]>;
  findByTenantAndStatus(
    tenantId: string,
    status: CashRegisterStatus
  ): Promise<CashRegister[]>;
  save(
    register: Omit<CashRegister, "id" | "createdAt" | "updatedAt">
  ): Promise<CashRegister>;
  update(
    id: string,
    updates: Partial<Omit<CashRegister, "id" | "tenantId" | "createdAt">>
  ): Promise<CashRegister | null>;
  delete(id: string): Promise<void>;
}

export interface CashSessionRepository {
  findById(id: string): Promise<CashSession | null>;
  findByTenant(tenantId: string): Promise<CashSession[]>;
  findByBranch(branchId: string): Promise<CashSession[]>;
  findByRegister(registerId: string): Promise<CashSession[]>;
  findOpenByRegister(registerId: string): Promise<CashSession | null>;
  findOpenByBranch(
    tenantId: string,
    branchId: string
  ): Promise<CashSession | null>; // For device-agnostic sessions
  findByTenantAndBranch(
    tenantId: string,
    branchId: string
  ): Promise<CashSession[]>;
  findByStatus(status: CashSessionStatus): Promise<CashSession[]>;
  findByDateRange(fromDate: Date, toDate: Date): Promise<CashSession[]>;
  save(
    session: Omit<CashSession, "id" | "createdAt" | "updatedAt">
  ): Promise<CashSession>;
  update(
    id: string,
    updates: Partial<Omit<CashSession, "id" | "tenantId" | "createdAt">>
  ): Promise<CashSession | null>;
  // Business queries
  getSessionSummary(sessionId: string): Promise<{
    session: CashSession;
    totalMovements: number;
    totalCashIn: number;
    totalCashOut: number;
  } | null>;
}

export interface CashMovementRepository {
  findById(id: string): Promise<CashMovement | null>;
  findBySession(sessionId: string): Promise<CashMovement[]>;
  findByRegister(registerId: string): Promise<CashMovement[]>;
  findByTenant(tenantId: string): Promise<CashMovement[]>;
  findByBranch(branchId: string): Promise<CashMovement[]>;
  findByType(type: CashMovementType): Promise<CashMovement[]>;
  findByStatus(status: CashMovementStatus): Promise<CashMovement[]>;
  findByActor(actorId: string): Promise<CashMovement[]>;
  findBySale(refSaleId: string): Promise<CashMovement[]>;
  findByDateRange(fromDate: Date, toDate: Date): Promise<CashMovement[]>;
  findPendingApprovals(): Promise<CashMovement[]>;
  save(movement: Omit<CashMovement, "id" | "createdAt">): Promise<CashMovement>;
  update(
    id: string,
    updates: Partial<Omit<CashMovement, "id" | "tenantId" | "createdAt">>
  ): Promise<CashMovement | null>;
  // Business queries
  getDailyMovements(
    tenantId: string,
    branchId: string,
    date: Date
  ): Promise<CashMovement[]>;
  getMovementSummary(sessionId: string): Promise<{
    totalPaidIn: number;
    totalPaidOut: number;
    totalRefunds: number;
    totalAdjustments: number;
    netCashFlow: number;
  }>;
}
