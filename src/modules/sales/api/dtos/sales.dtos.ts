import { z } from 'zod';

// Common schemas
const uuidSchema = z.string().uuid();
const positiveNumber = z.number().positive();
const nonNegativeInt = z.number().int().nonnegative();

// Enums
export const SaleType = z.enum(['dine_in', 'take_away', 'delivery']);
export type SaleType = z.infer<typeof SaleType>;

export const TenderCurrency = z.enum(['KHR', 'USD']);
export type TenderCurrency = z.infer<typeof TenderCurrency>;

export const PaymentMethod = z.enum(['cash', 'qr', 'transfer', 'other']);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

export const FulfillmentStatus = z.enum(['in_prep', 'ready', 'delivered', 'cancelled']);
export type FulfillmentStatus = z.infer<typeof FulfillmentStatus>;

// Command schemas
export const createSaleSchema = z.object({
  clientUuid: uuidSchema,
  saleType: SaleType
});

export const addItemSchema = z.object({
  saleId: uuidSchema,
  menuItemId: uuidSchema,
  quantity: nonNegativeInt.min(1),
  modifiers: z.array(z.any()).optional().default([])
});

export const updateItemQuantitySchema = z.object({
  saleId: uuidSchema,
  itemId: uuidSchema,
  quantity: nonNegativeInt.min(0)
});

export const preCheckoutSchema = z.object({
  saleId: uuidSchema,
  tenderCurrency: TenderCurrency,
  paymentMethod: PaymentMethod,
  cashReceived: z.object({
    khr: z.number().nonnegative().optional(),
    usd: z.number().nonnegative().optional()
  }).optional().refine(
    (data) => {
      if (!data) return true;
      // At least one currency must be provided and greater than 0
      return (data.khr !== undefined && data.khr > 0) || (data.usd !== undefined && data.usd > 0);
    },
    {
      message: 'Cash received must include either KHR or USD amount greater than 0 (the other currency will be auto-calculated)'
    }
  )
});

// Finalize doesn't need body validation - saleId from params, actorId from auth
export const finalizeSaleSchema = z.object({
  saleId: uuidSchema,
  actorId: uuidSchema
}).strict();

// Body-only validation schemas (for request body before controller enrichment)
export const updateFulfillmentBodySchema = z.object({
  status: FulfillmentStatus
});

export const voidSaleBodySchema = z.object({
  reason: z.string().min(1).max(500)
});

export const reopenSaleBodySchema = z.object({
  reason: z.string().min(1).max(500)
});

// Full command validation schemas (after controller adds params and auth data)
export const updateFulfillmentSchema = z.object({
  saleId: uuidSchema,
  status: FulfillmentStatus,
  actorId: uuidSchema
});

export const voidSaleSchema = z.object({
  saleId: uuidSchema,
  actorId: uuidSchema,
  reason: z.string().min(1).max(500)
});

export const reopenSaleSchema = z.object({
  saleId: uuidSchema,
  actorId: uuidSchema,
  reason: z.string().min(1).max(500)
});

// Query schemas
export const getSalesQuerySchema = z.object({
  status: z.string().optional(),
  saleType: SaleType.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

// Command interfaces
export interface CreateSaleCommand {
  clientUuid: string;
  tenantId: string;
  branchId: string;
  employeeId: string;
  saleType: SaleType;
}

export interface AddItemCommand {
  saleId: string;
  menuItemId: string;
  quantity: number;
  modifiers?: any[];
}

export interface UpdateItemQuantityCommand {
  saleId: string;
  itemId: string;
  quantity: number;
}

export interface PreCheckoutCommand {
  saleId: string;
  tenderCurrency: TenderCurrency;
  paymentMethod: PaymentMethod;
  cashReceived?: { khr?: number; usd?: number };
}

export interface FinalizeSaleCommand {
  saleId: string;
  actorId: string;
}

export interface UpdateFulfillmentCommand {
  saleId: string;
  status: FulfillmentStatus;
  actorId: string;
}

export interface VoidSaleCommand {
  saleId: string;
  actorId: string;
  reason: string;
}

export interface ReopenSaleCommand {
  saleId: string;
  actorId: string;
  reason: string;
}