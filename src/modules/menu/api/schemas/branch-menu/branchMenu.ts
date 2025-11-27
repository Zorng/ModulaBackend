import {z} from "zod";

export const setBranchAvailabilitySchema = z.object({
  branchId: z.string().uuid("Invalid branch ID"),
  isAvailable: z.boolean(),
});

export const setBranchPriceSchema = z.object({
  branchId: z.string().uuid("Invalid branch ID"),
  priceUsd: z
    .number()
    .min(0, "Price must be 0 or greater")
    .max(10000, "Price must be less than $10,000"),
});
