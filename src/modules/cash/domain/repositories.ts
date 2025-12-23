// Repository ports (interfaces) for Cash domain
// These define the contracts for data access, implemented in infra/

import type { PoolClient } from "pg";
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
  findById(id: string, client?: PoolClient): Promise<CashRegister | null>;
  findByTenant(tenantId: string, client?: PoolClient): Promise<CashRegister[]>;
  findByBranch(branchId: string, client?: PoolClient): Promise<CashRegister[]>;
  findByBranchAndName(
    branchId: string,
    name: string,
    client?: PoolClient
  ): Promise<CashRegister | null>;
  findByTenantAndBranch(
    tenantId: string,
    branchId: string,
    client?: PoolClient
  ): Promise<CashRegister[]>;
  findByTenantAndStatus(
    tenantId: string,
    status: CashRegisterStatus,
    client?: PoolClient
  ): Promise<CashRegister[]>;
  save(
    register: Omit<CashRegister, "id" | "createdAt" | "updatedAt">,
    client?: PoolClient
  ): Promise<CashRegister>;
  update(
    id: string,
    updates: Partial<Omit<CashRegister, "id" | "tenantId" | "createdAt">>,
    client?: PoolClient
  ): Promise<CashRegister | null>;
  delete(id: string, client?: PoolClient): Promise<void>;
}

export interface CashSessionRepository {
  findById(id: string, client?: PoolClient): Promise<CashSession | null>;
  findByTenant(tenantId: string, client?: PoolClient): Promise<CashSession[]>;
  findByBranch(branchId: string, client?: PoolClient): Promise<CashSession[]>;
  findByRegister(registerId: string, client?: PoolClient): Promise<CashSession[]>;
  findOpenByRegister(
    registerId: string,
    client?: PoolClient
  ): Promise<CashSession | null>;
  findOpenByBranch(
    tenantId: string,
    branchId: string,
    client?: PoolClient
  ): Promise<CashSession | null>; // For device-agnostic sessions
  findByTenantAndBranch(
    tenantId: string,
    branchId: string,
    client?: PoolClient
  ): Promise<CashSession[]>;
  findByStatus(
    status: CashSessionStatus,
    client?: PoolClient
  ): Promise<CashSession[]>;
  findByDateRange(
    fromDate: Date,
    toDate: Date,
    client?: PoolClient
  ): Promise<CashSession[]>;
  save(
    session: Omit<CashSession, "id" | "createdAt" | "updatedAt">,
    client?: PoolClient
  ): Promise<CashSession>;
  update(
    id: string,
    updates: Partial<Omit<CashSession, "id" | "tenantId" | "createdAt">>,
    client?: PoolClient
  ): Promise<CashSession | null>;
  // Business queries
  getSessionSummary(
    sessionId: string,
    client?: PoolClient
  ): Promise<{
    session: CashSession;
    totalMovements: number;
    totalCashIn: number;
    totalCashOut: number;
  } | null>;
}

export interface CashMovementRepository {
  findById(id: string, client?: PoolClient): Promise<CashMovement | null>;
  findBySession(
    sessionId: string,
    client?: PoolClient
  ): Promise<CashMovement[]>;
  findByRegister(
    registerId: string,
    client?: PoolClient
  ): Promise<CashMovement[]>;
  findByTenant(
    tenantId: string,
    client?: PoolClient
  ): Promise<CashMovement[]>;
  findByBranch(
    branchId: string,
    client?: PoolClient
  ): Promise<CashMovement[]>;
  findByType(
    type: CashMovementType,
    client?: PoolClient
  ): Promise<CashMovement[]>;
  findByStatus(
    status: CashMovementStatus,
    client?: PoolClient
  ): Promise<CashMovement[]>;
  findByActor(
    actorId: string,
    client?: PoolClient
  ): Promise<CashMovement[]>;
  findBySale(
    refSaleId: string,
    client?: PoolClient
  ): Promise<CashMovement[]>;
  findByDateRange(
    fromDate: Date,
    toDate: Date,
    client?: PoolClient
  ): Promise<CashMovement[]>;
  findPendingApprovals(client?: PoolClient): Promise<CashMovement[]>;
  save(
    movement: Omit<CashMovement, "id" | "createdAt">,
    client?: PoolClient
  ): Promise<CashMovement>;
  update(
    id: string,
    updates: Partial<Omit<CashMovement, "id" | "tenantId" | "createdAt">>,
    client?: PoolClient
  ): Promise<CashMovement | null>;
  // Business queries
  getDailyMovements(
    tenantId: string,
    branchId: string,
    date: Date,
    client?: PoolClient
  ): Promise<CashMovement[]>;
  getMovementSummary(
    sessionId: string,
    client?: PoolClient
  ): Promise<{
    totalPaidIn: number;
    totalPaidOut: number;
    totalRefunds: number;
    totalAdjustments: number;
    netCashFlow: number;
  }>;
}
