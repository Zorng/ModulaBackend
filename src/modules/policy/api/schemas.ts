import { z } from "zod";

const branchIdSchema = z.string().uuid().optional();

/**
 * Schema for updating tax policies (VAT)
 */
export const updateTaxPoliciesSchema = z
  .object({
    branchId: branchIdSchema,
    saleVatEnabled: z.boolean().optional(),
    saleVatRatePercent: z.number().min(0).max(100).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

export type UpdateTaxPoliciesInput = z.infer<
  typeof updateTaxPoliciesSchema
>;

/**
 * Schema for updating currency policies (FX rate)
 */
export const updateCurrencyPoliciesSchema = z
  .object({
    branchId: branchIdSchema,
    saleFxRateKhrPerUsd: z.number().min(1000).max(10000).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

export type UpdateCurrencyPoliciesInput = z.infer<
  typeof updateCurrencyPoliciesSchema
>;

/**
 * Schema for updating rounding policies
 */
export const updateRoundingPoliciesSchema = z
  .object({
    branchId: branchIdSchema,
    saleKhrRoundingEnabled: z.boolean().optional(),
    saleKhrRoundingMode: z.enum(["NEAREST", "UP", "DOWN"]).optional(),
    saleKhrRoundingGranularity: z.enum(["100", "1000"]).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

export type UpdateRoundingPoliciesInput = z.infer<
  typeof updateRoundingPoliciesSchema
>;

/**
 * Schema for updating inventory policies
 */
export const updateInventoryPoliciesSchema = z
  .object({
    branchId: branchIdSchema,
    inventoryAutoSubtractOnSale: z.boolean().optional(),
    inventoryExpiryTrackingEnabled: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

export type UpdateInventoryPoliciesInput = z.infer<
  typeof updateInventoryPoliciesSchema
>;

/**
 * Schema for updating cash session policies
 */
export const updateCashSessionPoliciesSchema = z
  .object({
    branchId: branchIdSchema,
    cashRequireSessionForSales: z.boolean().optional(),
    cashAllowPaidOut: z.boolean().optional(),
    cashRequireRefundApproval: z.boolean().optional(),
    cashAllowManualAdjustment: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

export type UpdateCashSessionPoliciesInput = z.infer<
  typeof updateCashSessionPoliciesSchema
>;

/**
 * Schema for updating attendance policies
 */
export const updateAttendancePoliciesSchema = z
  .object({
    branchId: branchIdSchema,
    attendanceAutoFromCashSession: z.boolean().optional(),
    attendanceRequireOutOfShiftApproval: z.boolean().optional(),
    attendanceEarlyCheckinBufferEnabled: z.boolean().optional(),
    attendanceCheckinBufferMinutes: z.number().int().min(0).max(120).optional(),
    attendanceAllowManagerEdits: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

export type UpdateAttendancePoliciesInput = z.infer<
  typeof updateAttendancePoliciesSchema
>;
