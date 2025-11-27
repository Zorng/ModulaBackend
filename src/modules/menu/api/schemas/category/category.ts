import { z } from "zod";

export const createCategorySchema = z.object({
  name: z
    .string()
    .min(1, "Category name is required")
    .max(100, "Category name must be 100 characters or less")
    .trim(),
  description: z.string().max(500).trim().optional(),
  displayOrder: z
    .number()
    .int()
    .min(0, "Display order must be 0 or greater")
    .default(0),
});

export const updateCategorySchema = z
  .object({
    name: z
      .string()
      .min(1, "Category name is required")
      .max(100, "Category name must be 100 characters or less")
      .trim()
      .optional(),
    displayOrder: z
      .number()
      .int()
      .min(0, "Display order must be 0 or greater")
      .optional(),
  })
  .refine(
    (data) => data.name !== undefined || data.displayOrder !== undefined,
    {
      message: "At least one field (name or displayOrder) must be provided",
    }
  );

export const categoryIdParamSchema = z.object({
  categoryId: z.string().uuid("Invalid category ID format"),
});