import {z} from "zod";

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