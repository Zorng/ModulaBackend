import {z} from "zod";
export const branchIdQuerySchema = z.object({
  branchId: z.string().uuid("Invalid branch ID"),
});

export const listCategoriesQuerySchema = z.object({
  isActive: z
    .string()
    .optional()
    .transform((val) => val === "true" || val === undefined),
});