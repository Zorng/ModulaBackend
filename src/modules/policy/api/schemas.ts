import { z } from "zod";

/**
 * Schema for updating tax policies (VAT)
 */
export const updateTaxPoliciesSchema = z
  .object({
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
 * Schema for updating cash session policies (all at once)
 */
export const updateCashSessionPoliciesSchema = z
  .object({
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
 * Schema for updating require session for sales policy
 */
export const updateRequireSessionForSalesSchema = z
  .object({
    cashRequireSessionForSales: z.boolean(),
  })
  .strict();

export type UpdateRequireSessionForSalesInput = z.infer<
  typeof updateRequireSessionForSalesSchema
>;

/**
 * Schema for updating allow paid-out policy
 */
export const updateAllowPaidOutSchema = z
  .object({
    cashAllowPaidOut: z.boolean(),
  })
  .strict();

export type UpdateAllowPaidOutInput = z.infer<
  typeof updateAllowPaidOutSchema
>;

/**
 * Schema for updating require refund approval policy
 */
export const updateRequireRefundApprovalSchema = z
  .object({
    cashRequireRefundApproval: z.boolean(),
  })
  .strict();

export type UpdateRequireRefundApprovalInput = z.infer<
  typeof updateRequireRefundApprovalSchema
>;

/**
 * Schema for updating allow manual adjustment policy
 */
export const updateAllowManualAdjustmentSchema = z
  .object({
    cashAllowManualAdjustment: z.boolean(),
  })
  .strict();

export type UpdateAllowManualAdjustmentInput = z.infer<
  typeof updateAllowManualAdjustmentSchema
>;

/**
 * Schema for updating attendance policies
 */
export const updateAttendancePoliciesSchema = z
  .object({
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
