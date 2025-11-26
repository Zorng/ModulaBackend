import { z } from "zod";

export const createModifierGroupSchema = z.object({
  name: z
    .string()
    .min(1, "Modifier group name is required")
    .max(100, "Modifier group name must be 100 characters or less")
    .trim(),
  selectionType: z.enum(["SINGLE", "MULTI"], {
    message: "Selection type must be SINGLE or MULTI",
  }),
});

export const addModifierOptionSchema = z.object({
  modifierGroupId: z.string().uuid("Invalid modifier group ID"),
  label: z
    .string()
    .min(1, "Option label is required")
    .max(100, "Option label must be 100 characters or less")
    .trim(),
  priceAdjustmentUsd: z
    .number()
    .min(-1000, "Price adjustment too low")
    .max(1000, "Price adjustment too high")
    .default(0),
  isDefault: z.boolean().default(false),
});

export const attachModifierSchema = z.object({
  modifierGroupId: z.string().uuid("Invalid modifier group ID"),
  isRequired: z.boolean().default(false),
});

export const modifierGroupIdParamSchema = z.object({
  modifierGroupId: z.string().uuid("Invalid modifier group ID format"),
});

export const modifierOptionIdParamSchema = z.object({
  optionId: z.string().uuid("Invalid modifier option ID format"),
});

export const menuItemIdAndModifierGroupIdParamSchema = z.object({
  menuItemId: z.string().uuid("Invalid menu item ID format"),
  modifierGroupId: z.string().uuid("Invalid modifier group ID format"),
});

export const updateModifierGroupSchema = z
  .object({
    name: z
      .string()
      .min(1, "Modifier group name is required")
      .max(100, "Modifier group name must be 100 characters or less")
      .trim()
      .optional(),
    selectionType: z
      .enum(["SINGLE", "MULTI"], {
        message: "Selection type must be SINGLE or MULTI",
      })
      .optional(),
  })
  .refine(
    (data) => data.name !== undefined || data.selectionType !== undefined,
    {
      message: "At least one field (name or selectionType) must be provided",
      path: ["name"],
    }
  );

export const updateModifierOptionSchema = z
  .object({
    label: z
      .string()
      .min(1, "Option label is required")
      .max(100, "Option label must be 100 characters or less")
      .trim()
      .optional(),
    priceAdjustmentUsd: z
      .number()
      .min(-1000, "Price adjustment too low")
      .max(1000, "Price adjustment too high")
      .optional(),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.label !== undefined ||
      data.priceAdjustmentUsd !== undefined ||
      data.isDefault !== undefined ||
      data.isActive !== undefined,
    {
      message:
        "At least one field (label, priceAdjustmentUsd, isDefault, isActive) must be provided",
      path: ["label"],
    }
  );
