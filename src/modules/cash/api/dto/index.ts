import { z } from "zod";

// Common schemas
const uuidSchema = z.string().uuid();
const nonNegativeNumber = z.number().nonnegative();
const positiveNumber = z.number().positive();

// Enums
export const CashMovementType = z.enum(["PAID_IN", "PAID_OUT", "ADJUSTMENT"]);
export type CashMovementType = z.infer<typeof CashMovementType>;

// ==================== Session Schemas ====================

// Open Session
export const openSessionBodySchema = z.object({
  registerId: uuidSchema,
  openingFloatUsd: nonNegativeNumber,
  openingFloatKhr: nonNegativeNumber,
  note: z.string().max(500).optional(),
});

export const openSessionSchema = z.object({
  tenantId: uuidSchema,
  branchId: uuidSchema,
  registerId: uuidSchema,
  openedBy: uuidSchema,
  openingFloatUsd: nonNegativeNumber,
  openingFloatKhr: nonNegativeNumber,
  note: z.string().max(500).optional(),
});

export type OpenSessionInput = z.infer<typeof openSessionSchema>;

// Take Over Session
export const takeOverSessionBodySchema = z.object({
  registerId: uuidSchema,
  reason: z.string().min(3).max(500),
  openingFloatUsd: nonNegativeNumber,
  openingFloatKhr: nonNegativeNumber,
});

export const takeOverSessionSchema = z.object({
  tenantId: uuidSchema,
  branchId: uuidSchema,
  registerId: uuidSchema,
  newOpenedBy: uuidSchema,
  reason: z.string().min(3).max(500),
  openingFloatUsd: nonNegativeNumber,
  openingFloatKhr: nonNegativeNumber,
});

export type TakeOverSessionInput = z.infer<typeof takeOverSessionSchema>;

// Close Session
export const closeSessionBodySchema = z.object({
  countedCashUsd: nonNegativeNumber,
  countedCashKhr: nonNegativeNumber,
  note: z.string().max(500).optional(),
});

export const closeSessionSchema = z.object({
  sessionId: uuidSchema,
  closedBy: uuidSchema,
  countedCashUsd: nonNegativeNumber,
  countedCashKhr: nonNegativeNumber,
  note: z.string().max(500).optional(),
});

export type CloseSessionInput = z.infer<typeof closeSessionSchema>;

// ==================== Movement Schemas ====================

// Record Movement
export const recordMovementBodySchema = z.object({
  type: CashMovementType,
  amountUsd: nonNegativeNumber,
  amountKhr: nonNegativeNumber,
  reason: z.string().min(3).max(120),
});

export const recordMovementSchema = z.object({
  tenantId: uuidSchema,
  branchId: uuidSchema,
  registerId: uuidSchema,
  sessionId: uuidSchema,
  actorId: uuidSchema,
  type: CashMovementType,
  amountUsd: nonNegativeNumber,
  amountKhr: nonNegativeNumber,
  reason: z.string().min(3).max(120),
  requiresApproval: z.boolean().optional().default(false),
});

export type RecordMovementInput = z.infer<typeof recordMovementSchema>;

// ==================== Query Schemas ====================

export const getActiveSessionQuerySchema = z.object({
  registerId: uuidSchema,
});

export const getZReportParamsSchema = z.object({
  sessionId: uuidSchema,
});

export const getXReportQuerySchema = z.object({
  registerId: uuidSchema,
});

export const getDailySummaryQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(), // YYYY-MM-DD format
  branchId: uuidSchema.optional(),
});
