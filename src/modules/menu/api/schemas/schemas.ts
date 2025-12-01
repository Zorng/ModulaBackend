import { z } from "zod";
import { createCategorySchema } from "../schemas/category/category.js";
import { updateCategorySchema } from "../schemas/category/category.js";
import { createMenuItemSchema } from "./menu-item/menuItem.js";
import { updateMenuItemSchema } from "./menu-item/menuItem.js";
import {
  createModifierGroupSchema,
  addModifierOptionSchema,
  attachModifierSchema,
  updateModifierGroupSchema,
  updateModifierOptionSchema,
} from "./modifier/modifier.js";
import { setBranchAvailabilitySchema } from "./branch-menu/branchMenu.js";
import { setBranchPriceSchema } from "./branch-menu/branchMenu.js";

export * from "./category/category.js";
export * from "./menu-item/menuItem.js";
export * from "./modifier/modifier.js";
export * from "./branch-menu/branchMenu.js";
export * from "./query/query.js";
// ============================================================================
// TYPE EXPORTS (for use in controllers)
// ============================================================================

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;
export type CreateModifierGroupInput = z.infer<
  typeof createModifierGroupSchema
>;
export type AddModifierOptionInput = z.infer<typeof addModifierOptionSchema>;
export type AttachModifierInput = z.infer<typeof attachModifierSchema>;
export type UpdateModifierGroupInput = z.infer<
  typeof updateModifierGroupSchema
>;
export type UpdateModifierOptionInput = z.infer<
  typeof updateModifierOptionSchema
>;
export type SetBranchAvailabilityInput = z.infer<
  typeof setBranchAvailabilitySchema
>;
export type SetBranchPriceInput = z.infer<typeof setBranchPriceSchema>;
