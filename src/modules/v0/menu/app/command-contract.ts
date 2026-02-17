import {
  buildCommandDedupeKey,
  type CommandOutcome,
} from "../../../../shared/utils/dedupe.js";

export type MenuCommandOutcome = CommandOutcome;

export const V0_MENU_ACTION_KEYS = {
  listItems: "menu.items.list",
  listAllItems: "menu.items.listAll",
  readItem: "menu.items.read",
  createItem: "menu.items.create",
  updateItem: "menu.items.update",
  archiveItem: "menu.items.archive",
  restoreItem: "menu.items.restore",
  setItemVisibility: "menu.items.visibility.set",

  listCategories: "menu.categories.list",
  createCategory: "menu.categories.create",
  updateCategory: "menu.categories.update",
  archiveCategory: "menu.categories.archive",

  listModifierGroups: "menu.modifierGroups.list",
  createModifierGroup: "menu.modifierGroups.create",
  updateModifierGroup: "menu.modifierGroups.update",
  archiveModifierGroup: "menu.modifierGroups.archive",

  createModifierOption: "menu.modifierOptions.create",
  updateModifierOption: "menu.modifierOptions.update",
  archiveModifierOption: "menu.modifierOptions.archive",

  upsertComposition: "menu.composition.upsert",
  evaluateComposition: "menu.composition.evaluate",
} as const;

export const V0_MENU_EVENT_TYPES = {
  itemCreated: "MENU_ITEM_CREATED",
  itemUpdated: "MENU_ITEM_UPDATED",
  itemArchived: "MENU_ITEM_ARCHIVED",
  itemRestored: "MENU_ITEM_RESTORED",
  itemVisibilitySet: "MENU_ITEM_BRANCH_VISIBILITY_SET",
  categoryCreated: "MENU_CATEGORY_CREATED",
  categoryUpdated: "MENU_CATEGORY_UPDATED",
  categoryArchived: "MENU_CATEGORY_ARCHIVED",
  modifierGroupCreated: "MODIFIER_GROUP_CREATED",
  modifierGroupUpdated: "MODIFIER_GROUP_UPDATED",
  modifierGroupArchived: "MODIFIER_GROUP_ARCHIVED",
  modifierOptionCreated: "MODIFIER_OPTION_CREATED",
  modifierOptionUpdated: "MODIFIER_OPTION_UPDATED",
  modifierOptionArchived: "MODIFIER_OPTION_ARCHIVED",
  compositionUpserted: "MENU_ITEM_COMPOSITION_UPSERTED",
} as const;

export const V0_MENU_IDEMPOTENCY_SCOPE = {
  branchWriteActions: [
    V0_MENU_ACTION_KEYS.createItem,
    V0_MENU_ACTION_KEYS.updateItem,
    V0_MENU_ACTION_KEYS.archiveItem,
    V0_MENU_ACTION_KEYS.restoreItem,
  ] as const,
  tenantWriteActions: [
    V0_MENU_ACTION_KEYS.setItemVisibility,
    V0_MENU_ACTION_KEYS.createCategory,
    V0_MENU_ACTION_KEYS.updateCategory,
    V0_MENU_ACTION_KEYS.archiveCategory,
    V0_MENU_ACTION_KEYS.createModifierGroup,
    V0_MENU_ACTION_KEYS.updateModifierGroup,
    V0_MENU_ACTION_KEYS.archiveModifierGroup,
    V0_MENU_ACTION_KEYS.createModifierOption,
    V0_MENU_ACTION_KEYS.updateModifierOption,
    V0_MENU_ACTION_KEYS.archiveModifierOption,
    V0_MENU_ACTION_KEYS.upsertComposition,
  ] as const,
} as const;

export function buildMenuCommandDedupeKey(
  actionKey: string,
  idempotencyKey: string | null | undefined,
  outcome: MenuCommandOutcome,
  parts?: ReadonlyArray<unknown>
): string | null {
  return buildCommandDedupeKey({
    actionKey,
    idempotencyKey,
    outcome,
    parts,
  });
}
