import { z } from "zod";

export const createMenuItemSchema = z.object({
  categoryId: z.string().uuid("Invalid category ID"),
  name: z
    .string()
    .min(1, "Menu item name is required")
    .max(200, "Menu item name must be 200 characters or less")
    .trim(),
  description: z.string().max(1000).trim().optional(),
  priceUsd: z
    .number()
    .min(0, "Price must be 0 or greater")
    .max(10000, "Price must be less than $10,000"),
  imageUrl: z
    .string()
    .url("Invalid image URL")
    .regex(
      /\.(jpg|jpeg|png|webp)$/i,
      "Image must be .jpg, .jpeg, .png, or .webp"
    )
    .optional(),
});

export const updateMenuItemSchema = z
  .object({
    name: z
      .string()
      .min(1, "Menu item name is required")
      .max(200, "Menu item name must be 200 characters or less")
      .trim()
      .optional(),
    description: z.string().max(1000).trim().optional(),
    priceUsd: z
      .number()
      .min(0, "Price must be 0 or greater")
      .max(10000, "Price must be less than $10,000")
      .optional(),
    categoryId: z.string().uuid("Invalid category ID").optional(),
    imageUrl: z
      .string()
      .url("Invalid image URL")
      .regex(
        /\.(jpg|jpeg|png|webp)$/i,
        "Image must be .jpg, .jpeg, .png, or .webp"
      )
      .optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.description !== undefined ||
      data.priceUsd !== undefined ||
      data.categoryId !== undefined ||
      data.imageUrl !== undefined,
    {
      message: "At least one field must be provided",
    }
  );

export const menuItemIdParamSchema = z.object({
  menuItemId: z.string().uuid("Invalid menu item ID format"),
});
