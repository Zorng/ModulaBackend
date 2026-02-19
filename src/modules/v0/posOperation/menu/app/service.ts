import {
  V0MenuRepository,
  type MenuActiveStatus,
  type MenuModifierOptionDeltaRow,
  type MenuTrackingMode,
} from "../infra/repository.js";
import { V0MediaUploadRepository } from "../../../../../platform/media-uploads/repository.js";
import { deriveObjectKeyFromImageUrl } from "../../../../../platform/storage/r2-image-storage.js";

type ActorContext = {
  accountId: string;
  tenantId: string | null;
  branchId: string | null;
};

type StatusFilter = "active" | "archived" | "all";

type MenuComponentInput = {
  stockItemId: string;
  quantityInBaseUnit: number;
  trackingMode: MenuTrackingMode;
};

export class V0MenuError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code?: string
  ) {
    super(message);
    this.name = "V0MenuError";
  }
}

export class V0MenuService {
  constructor(
    private readonly repo: V0MenuRepository,
    private readonly mediaUploadsRepo?: V0MediaUploadRepository
  ) {}

  async listItems(input: {
    actor: ActorContext;
    status?: string;
    categoryId?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    const scope = assertBranchContext(input.actor);
    const status = normalizeStatusFilter(input.status);
    const categoryId = normalizeOptionalString(input.categoryId);
    const search = normalizeOptionalString(input.search)?.toLowerCase() ?? null;
    const limit = normalizeLimit(input.limit);
    const offset = normalizeOffset(input.offset);

    const rows = await this.repo.listVisibleMenuItemsByBranch({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      status: mapStatusFilter(status),
    });

    const filtered = rows.filter((row) => {
      if (categoryId && row.category_id !== categoryId) {
        return false;
      }
      if (search && !row.name.toLowerCase().includes(search)) {
        return false;
      }
      return true;
    });

    const page = filtered.slice(offset, offset + limit);
    return Promise.all(
      page.map(async (row) => {
        const visibleBranchIds = await this.repo.listVisibleBranchIdsForMenuItem({
          tenantId: scope.tenantId,
          menuItemId: row.id,
        });
        const modifierGroupIds = await this.repo.listModifierGroupIdsForMenuItem({
          tenantId: scope.tenantId,
          menuItemId: row.id,
        });
        return {
          id: row.id,
          tenantId: row.tenant_id,
          name: row.name,
          basePrice: row.base_price,
          categoryId: row.category_id,
          status: row.status,
          visibleBranchIds,
          modifierGroupIds,
          imageUrl: row.image_url,
          createdAt: row.created_at.toISOString(),
          updatedAt: row.updated_at.toISOString(),
        };
      })
    );
  }

  async listAllItems(input: {
    actor: ActorContext;
    status?: string;
    categoryId?: string;
    search?: string;
    branchId?: string;
    limit?: number;
    offset?: number;
  }) {
    const scope = assertTenantContext(input.actor);
    const status = normalizeStatusFilter(input.status);
    const categoryId = normalizeOptionalString(input.categoryId);
    const search = normalizeOptionalString(input.search)?.toLowerCase() ?? null;
    const branchId = input.branchId ? requireUuid(input.branchId, "branchId") : null;
    const limit = normalizeLimit(input.limit);
    const offset = normalizeOffset(input.offset);

    const rows = await this.repo.listMenuItemsByTenant({
      tenantId: scope.tenantId,
      status: mapStatusFilter(status),
    });

    const mapped = await Promise.all(
      rows.map(async (row) => {
        const visibleBranchIds = await this.repo.listVisibleBranchIdsForMenuItem({
          tenantId: scope.tenantId,
          menuItemId: row.id,
        });
        const modifierGroupIds = await this.repo.listModifierGroupIdsForMenuItem({
          tenantId: scope.tenantId,
          menuItemId: row.id,
        });
        return {
          id: row.id,
          tenantId: row.tenant_id,
          name: row.name,
          basePrice: row.base_price,
          categoryId: row.category_id,
          status: row.status,
          visibleBranchIds,
          modifierGroupIds,
          imageUrl: row.image_url,
          createdAt: row.created_at.toISOString(),
          updatedAt: row.updated_at.toISOString(),
        };
      })
    );

    const filtered = mapped.filter((row) => {
      if (categoryId && row.categoryId !== categoryId) {
        return false;
      }
      if (search && !row.name.toLowerCase().includes(search)) {
        return false;
      }
      if (branchId && !row.visibleBranchIds.includes(branchId)) {
        return false;
      }
      return true;
    });

    return filtered.slice(offset, offset + limit);
  }

  async getItem(input: { actor: ActorContext; menuItemId: string }) {
    const scope = assertBranchContext(input.actor);
    const menuItemId = requireUuid(input.menuItemId, "menuItemId");
    const row = await this.repo.getMenuItemVisibleInBranch({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      menuItemId,
    });
    if (!row) {
      throw new V0MenuError(404, "menu item not found", "MENU_ITEM_NOT_FOUND");
    }

    const visibleBranchIds = await this.repo.listVisibleBranchIdsForMenuItem({
      tenantId: scope.tenantId,
      menuItemId,
    });
    const modifierGroupIds = await this.repo.listModifierGroupIdsForMenuItem({
      tenantId: scope.tenantId,
      menuItemId,
    });
    const modifierGroups = await this.repo.listModifierGroups({
      tenantId: scope.tenantId,
      status: null,
    });
    const relevantGroups = modifierGroups.filter((group) =>
      modifierGroupIds.includes(group.id)
    );
    const options = await this.repo.listModifierOptionsByGroupIds({
      tenantId: scope.tenantId,
      groupIds: relevantGroups.map((group) => group.id),
    });
    const optionDeltas = await this.repo.listComponentDeltasByModifierOptionIds({
      tenantId: scope.tenantId,
      modifierOptionIds: options.map((option) => option.id),
    });
    const category = row.category_id
      ? await this.repo.getCategoryById({
          tenantId: scope.tenantId,
          categoryId: row.category_id,
        })
      : null;

    const baseComponents = await this.repo.listBaseComponentsForMenuItem({
      tenantId: scope.tenantId,
      menuItemId,
    });

    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      basePrice: row.base_price,
      categoryId: row.category_id,
      status: row.status,
      visibleBranchIds,
      modifierGroupIds,
      imageUrl: row.image_url,
      categoryName: category?.name ?? null,
      modifierGroups: relevantGroups.map((group) => ({
        id: group.id,
        tenantId: group.tenant_id,
        name: group.name,
        selectionMode: group.selection_mode,
        minSelections: group.min_selections,
        maxSelections: group.max_selections,
        isRequired: group.is_required,
        status: group.status,
        options: options
          .filter((option) => option.modifier_group_id === group.id)
          .map((option) => ({
            id: option.id,
            groupId: option.modifier_group_id,
            label: option.label,
            priceDelta: option.price_delta,
            status: option.status,
            componentDeltas: optionDeltas
              .filter((delta) => delta.modifier_option_id === option.id)
              .map((delta) => ({
                stockItemId: delta.stock_item_id,
                quantityDeltaInBaseUnit: delta.quantity_delta_in_base_unit,
                trackingMode: delta.tracking_mode,
              })),
          })),
      })),
      baseComponents: baseComponents.map((component) => ({
        stockItemId: component.stock_item_id,
        quantityInBaseUnit: component.quantity_in_base_unit,
        trackingMode: component.tracking_mode,
      })),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async updateCategory(input: {
    actor: ActorContext;
    categoryId: string;
    body: unknown;
  }) {
    const scope = assertTenantContext(input.actor);
    const categoryId = requireUuid(input.categoryId, "categoryId");
    const body = toObject(input.body);
    if (!hasOwn(body, "name")) {
      throw new V0MenuError(422, "at least one field is required");
    }
    const name = requireNonEmptyString(body.name, "name");

    const updated = await this.repo.updateCategoryName({
      tenantId: scope.tenantId,
      categoryId,
      name,
    });
    if (!updated) {
      throw new V0MenuError(404, "category not found", "MENU_CATEGORY_NOT_FOUND");
    }

    return {
      id: updated.id,
      tenantId: updated.tenant_id,
      name: updated.name,
      status: updated.status,
      createdAt: updated.created_at.toISOString(),
      updatedAt: updated.updated_at.toISOString(),
    };
  }

  async archiveCategory(input: {
    actor: ActorContext;
    categoryId: string;
  }) {
    const scope = assertTenantContext(input.actor);
    const categoryId = requireUuid(input.categoryId, "categoryId");
    const archived = await this.repo.archiveCategory({
      tenantId: scope.tenantId,
      categoryId,
    });
    if (!archived) {
      throw new V0MenuError(404, "category not found", "MENU_CATEGORY_NOT_FOUND");
    }

    // Archived category becomes uncategorized view for linked items.
    await this.repo.clearCategoryFromMenuItems({
      tenantId: scope.tenantId,
      categoryId,
    });

    return {
      id: archived.id,
      tenantId: archived.tenant_id,
      status: archived.status,
      updatedAt: archived.updated_at.toISOString(),
    };
  }

  async createCategory(input: {
    actor: ActorContext;
    name: unknown;
  }) {
    const scope = assertTenantContext(input.actor);
    const name = requireNonEmptyString(input.name, "name");
    const row = await this.repo.createCategory({
      tenantId: scope.tenantId,
      name,
    });

    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async listCategories(input: {
    actor: ActorContext;
    status?: string;
  }) {
    const scope = assertTenantContext(input.actor);
    const status = normalizeStatusFilter(input.status);
    const rows = await this.repo.listCategories({
      tenantId: scope.tenantId,
      status: mapStatusFilter(status),
    });
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async createModifierGroup(input: {
    actor: ActorContext;
    name: unknown;
    selectionMode: unknown;
    minSelections: unknown;
    maxSelections: unknown;
    isRequired: unknown;
  }) {
    const scope = assertTenantContext(input.actor);
    const name = requireNonEmptyString(input.name, "name");
    const selectionMode = normalizeSelectionMode(input.selectionMode);
    const minSelections = toNonNegativeInteger(input.minSelections, "minSelections");
    const maxSelections = toNonNegativeInteger(input.maxSelections, "maxSelections");
    const isRequired = toBoolean(input.isRequired, "isRequired");

    if (maxSelections < minSelections) {
      throw new V0MenuError(422, "maxSelections must be >= minSelections");
    }
    if (isRequired && minSelections < 1) {
      throw new V0MenuError(422, "required group must have minSelections >= 1");
    }

    const row = await this.repo.createModifierGroup({
      tenantId: scope.tenantId,
      name,
      selectionMode,
      minSelections,
      maxSelections,
      isRequired,
    });
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      selectionMode: row.selection_mode,
      minSelections: row.min_selections,
      maxSelections: row.max_selections,
      isRequired: row.is_required,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async updateModifierGroup(input: {
    actor: ActorContext;
    groupId: string;
    body: unknown;
  }) {
    const scope = assertTenantContext(input.actor);
    const groupId = requireUuid(input.groupId, "groupId");
    const body = toObject(input.body);
    const existing = await this.repo.getModifierGroupById({
      tenantId: scope.tenantId,
      groupId,
    });
    if (!existing) {
      throw new V0MenuError(404, "modifier group not found", "MODIFIER_GROUP_NOT_FOUND");
    }

    if (
      !hasOwn(body, "name") &&
      !hasOwn(body, "selectionMode") &&
      !hasOwn(body, "minSelections") &&
      !hasOwn(body, "maxSelections") &&
      !hasOwn(body, "isRequired")
    ) {
      throw new V0MenuError(422, "at least one field is required");
    }

    const name = hasOwn(body, "name") ? requireNonEmptyString(body.name, "name") : existing.name;
    const selectionMode = hasOwn(body, "selectionMode")
      ? normalizeSelectionMode(body.selectionMode)
      : existing.selection_mode;
    const minSelections = hasOwn(body, "minSelections")
      ? toNonNegativeInteger(body.minSelections, "minSelections")
      : existing.min_selections;
    const maxSelections = hasOwn(body, "maxSelections")
      ? toNonNegativeInteger(body.maxSelections, "maxSelections")
      : existing.max_selections;
    const isRequired = hasOwn(body, "isRequired")
      ? toBoolean(body.isRequired, "isRequired")
      : existing.is_required;

    if (maxSelections < minSelections) {
      throw new V0MenuError(422, "maxSelections must be >= minSelections");
    }
    if (isRequired && minSelections < 1) {
      throw new V0MenuError(422, "required group must have minSelections >= 1");
    }

    const updated = await this.repo.updateModifierGroup({
      tenantId: scope.tenantId,
      groupId,
      name,
      selectionMode,
      minSelections,
      maxSelections,
      isRequired,
    });
    if (!updated) {
      throw new V0MenuError(404, "modifier group not found", "MODIFIER_GROUP_NOT_FOUND");
    }

    return {
      id: updated.id,
      tenantId: updated.tenant_id,
      name: updated.name,
      selectionMode: updated.selection_mode,
      minSelections: updated.min_selections,
      maxSelections: updated.max_selections,
      isRequired: updated.is_required,
      status: updated.status,
      createdAt: updated.created_at.toISOString(),
      updatedAt: updated.updated_at.toISOString(),
    };
  }

  async archiveModifierGroup(input: {
    actor: ActorContext;
    groupId: string;
  }) {
    const scope = assertTenantContext(input.actor);
    const groupId = requireUuid(input.groupId, "groupId");
    const archived = await this.repo.updateModifierGroupStatus({
      tenantId: scope.tenantId,
      groupId,
      status: "ARCHIVED",
    });
    if (!archived) {
      throw new V0MenuError(404, "modifier group not found", "MODIFIER_GROUP_NOT_FOUND");
    }
    return {
      id: archived.id,
      tenantId: archived.tenant_id,
      status: archived.status,
      updatedAt: archived.updated_at.toISOString(),
    };
  }

  async listModifierGroups(input: {
    actor: ActorContext;
    status?: string;
  }) {
    const scope = assertTenantContext(input.actor);
    const status = normalizeStatusFilter(input.status);
    const groups = await this.repo.listModifierGroups({
      tenantId: scope.tenantId,
      status: mapStatusFilter(status),
    });
    const options = await this.repo.listModifierOptionsByGroupIds({
      tenantId: scope.tenantId,
      groupIds: groups.map((group) => group.id),
    });
    const optionDeltas = await this.repo.listComponentDeltasByModifierOptionIds({
      tenantId: scope.tenantId,
      modifierOptionIds: options.map((option) => option.id),
    });

    return groups.map((group) => ({
      id: group.id,
      tenantId: group.tenant_id,
      name: group.name,
      selectionMode: group.selection_mode,
      minSelections: group.min_selections,
      maxSelections: group.max_selections,
      isRequired: group.is_required,
      status: group.status,
      options: options
        .filter((option) => option.modifier_group_id === group.id)
        .map((option) => ({
            id: option.id,
            groupId: option.modifier_group_id,
            label: option.label,
            priceDelta: option.price_delta,
            status: option.status,
            componentDeltas: optionDeltas
              .filter((delta) => delta.modifier_option_id === option.id)
              .map((delta) => ({
                stockItemId: delta.stock_item_id,
                quantityDeltaInBaseUnit: delta.quantity_delta_in_base_unit,
                trackingMode: delta.tracking_mode,
              })),
          })),
      createdAt: group.created_at.toISOString(),
      updatedAt: group.updated_at.toISOString(),
    }));
  }

  async createModifierOption(input: {
    actor: ActorContext;
    groupId: string;
    label: unknown;
    priceDelta: unknown;
    componentDeltas?: unknown;
  }) {
    const scope = assertTenantContext(input.actor);
    const groupId = requireUuid(input.groupId, "groupId");
    const group = await this.repo.getModifierGroupById({
      tenantId: scope.tenantId,
      groupId,
    });
    if (!group) {
      throw new V0MenuError(404, "modifier group not found", "MODIFIER_GROUP_NOT_FOUND");
    }
    const label = requireNonEmptyString(input.label, "label");
    const priceDelta = toFiniteNumber(input.priceDelta, "priceDelta");
    const componentDeltas = toComponentDeltaArray(input.componentDeltas, "componentDeltas");
    const hasTracked = componentDeltas.some((delta) => delta.trackingMode === "TRACKED");
    if (hasTracked) {
      await assertInventoryEntitlementForTrackedComponents(this.repo, input.actor, scope.tenantId);
    }

    const row = await this.repo.createModifierOption({
      tenantId: scope.tenantId,
      groupId,
      label,
      priceDelta,
    });
    await this.repo.setComponentDeltasForModifierOption({
      tenantId: scope.tenantId,
      modifierOptionId: row.id,
      deltas: componentDeltas,
    });

    return {
      id: row.id,
      groupId: row.modifier_group_id,
      label: row.label,
      priceDelta: row.price_delta,
      status: row.status,
      componentDeltas,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async updateModifierOption(input: {
    actor: ActorContext;
    groupId: string;
    optionId: string;
    body: unknown;
  }) {
    const scope = assertTenantContext(input.actor);
    const groupId = requireUuid(input.groupId, "groupId");
    const optionId = requireUuid(input.optionId, "optionId");
    const body = toObject(input.body);
    const existing = await this.repo.getModifierOptionById({
      tenantId: scope.tenantId,
      optionId,
    });
    if (!existing || existing.modifier_group_id !== groupId) {
      throw new V0MenuError(404, "modifier option not found", "MODIFIER_OPTION_NOT_FOUND");
    }

    if (!hasOwn(body, "label") && !hasOwn(body, "priceDelta") && !hasOwn(body, "componentDeltas")) {
      throw new V0MenuError(422, "at least one field is required");
    }

    const label = hasOwn(body, "label") ? requireNonEmptyString(body.label, "label") : existing.label;
    const priceDelta = hasOwn(body, "priceDelta")
      ? toFiniteNumber(body.priceDelta, "priceDelta")
      : existing.price_delta;
    const nextComponentDeltas = hasOwn(body, "componentDeltas")
      ? toComponentDeltaArray(body.componentDeltas, "componentDeltas")
      : null;
    const hasTracked = (nextComponentDeltas ?? []).some((delta) => delta.trackingMode === "TRACKED");
    if (hasTracked) {
      await assertInventoryEntitlementForTrackedComponents(this.repo, input.actor, scope.tenantId);
    }

    const updated = await this.repo.updateModifierOption({
      tenantId: scope.tenantId,
      optionId,
      label,
      priceDelta,
    });
    if (!updated) {
      throw new V0MenuError(404, "modifier option not found", "MODIFIER_OPTION_NOT_FOUND");
    }

    if (nextComponentDeltas) {
      await this.repo.setComponentDeltasForModifierOption({
        tenantId: scope.tenantId,
        modifierOptionId: optionId,
        deltas: nextComponentDeltas,
      });
    }
    const effectiveDeltas =
      nextComponentDeltas ??
      (await this.repo.listComponentDeltasByModifierOptionIds({
        tenantId: scope.tenantId,
        modifierOptionIds: [optionId],
      })).map((delta) => ({
        stockItemId: delta.stock_item_id,
        quantityDeltaInBaseUnit: delta.quantity_delta_in_base_unit,
        trackingMode: delta.tracking_mode,
      }));

    return {
      id: updated.id,
      groupId: updated.modifier_group_id,
      label: updated.label,
      priceDelta: updated.price_delta,
      status: updated.status,
      componentDeltas: effectiveDeltas,
      createdAt: updated.created_at.toISOString(),
      updatedAt: updated.updated_at.toISOString(),
    };
  }

  async archiveModifierOption(input: {
    actor: ActorContext;
    groupId: string;
    optionId: string;
  }) {
    const scope = assertTenantContext(input.actor);
    const groupId = requireUuid(input.groupId, "groupId");
    const optionId = requireUuid(input.optionId, "optionId");

    const existing = await this.repo.getModifierOptionById({
      tenantId: scope.tenantId,
      optionId,
    });
    if (!existing || existing.modifier_group_id !== groupId) {
      throw new V0MenuError(404, "modifier option not found", "MODIFIER_OPTION_NOT_FOUND");
    }

    const archived = await this.repo.updateModifierOptionStatus({
      tenantId: scope.tenantId,
      optionId,
      status: "ARCHIVED",
    });
    if (!archived) {
      throw new V0MenuError(404, "modifier option not found", "MODIFIER_OPTION_NOT_FOUND");
    }

    return {
      id: archived.id,
      groupId: archived.modifier_group_id,
      status: archived.status,
      updatedAt: archived.updated_at.toISOString(),
    };
  }

  async createMenuItem(input: {
    actor: ActorContext;
    body: unknown;
  }) {
    const scope = assertBranchContext(input.actor);
    const body = toObject(input.body);
    const name = requireNonEmptyString(body.name, "name");
    const basePrice = toNonNegativeNumber(body.basePrice, "basePrice");
    const categoryId = optionalUuid(body.categoryId, "categoryId");
    const imageUrl = optionalString(body.imageUrl);
    const visibleBranchIds = toUuidArray(body.visibleBranchIds, "visibleBranchIds");
    const modifierGroupIds = toUuidArray(body.modifierGroupIds, "modifierGroupIds");

    const created = await this.repo.createMenuItem({
      tenantId: scope.tenantId,
      name,
      basePrice,
      categoryId,
      imageUrl,
    });

    await this.repo.setMenuItemVisibility({
      tenantId: scope.tenantId,
      menuItemId: created.id,
      branchIds: visibleBranchIds,
    });
    await this.repo.setModifierGroupsForMenuItem({
      tenantId: scope.tenantId,
      menuItemId: created.id,
      groupIds: modifierGroupIds,
    });
    await this.linkMenuImageUpload({
      tenantId: scope.tenantId,
      menuItemId: created.id,
      imageUrl: created.image_url,
    });

    return {
      id: created.id,
      tenantId: created.tenant_id,
      name: created.name,
      basePrice: created.base_price,
      categoryId: created.category_id,
      status: created.status,
      visibleBranchIds,
      modifierGroupIds,
      imageUrl: created.image_url,
      createdAt: created.created_at.toISOString(),
      updatedAt: created.updated_at.toISOString(),
    };
  }

  async updateMenuItem(input: {
    actor: ActorContext;
    menuItemId: string;
    body: unknown;
  }) {
    const scope = assertBranchContext(input.actor);
    const menuItemId = requireUuid(input.menuItemId, "menuItemId");
    const body = toObject(input.body);
    const existing = await this.repo.getMenuItemById({
      tenantId: scope.tenantId,
      menuItemId,
    });
    if (!existing) {
      throw new V0MenuError(404, "menu item not found", "MENU_ITEM_NOT_FOUND");
    }

    const hasName = hasOwn(body, "name");
    const hasBasePrice = hasOwn(body, "basePrice");
    const hasCategory = hasOwn(body, "categoryId");
    const hasModifierGroups = hasOwn(body, "modifierGroupIds");
    const hasVisibleBranches = hasOwn(body, "visibleBranchIds");
    const hasImageUrl = hasOwn(body, "imageUrl");

    if (
      !hasName &&
      !hasBasePrice &&
      !hasCategory &&
      !hasModifierGroups &&
      !hasVisibleBranches &&
      !hasImageUrl
    ) {
      throw new V0MenuError(422, "at least one field is required");
    }

    const name = hasName ? requireNonEmptyString(body.name, "name") : existing.name;
    const basePrice = hasBasePrice
      ? toNonNegativeNumber(body.basePrice, "basePrice")
      : existing.base_price;
    let categoryId = existing.category_id;
    if (hasCategory) {
      categoryId =
        body.categoryId === null ? null : requireUuid(body.categoryId, "categoryId");
      if (categoryId) {
        const category = await this.repo.getCategoryById({
          tenantId: scope.tenantId,
          categoryId,
        });
        if (!category) {
          throw new V0MenuError(422, "categoryId must reference a valid category");
        }
      }
    }
    const imageUrl = hasImageUrl ? optionalString(body.imageUrl) : existing.image_url;

    const updated = await this.repo.updateMenuItem({
      tenantId: scope.tenantId,
      menuItemId,
      name,
      basePrice,
      categoryId,
      imageUrl,
    });
    if (!updated) {
      throw new V0MenuError(404, "menu item not found", "MENU_ITEM_NOT_FOUND");
    }
    if (hasImageUrl) {
      await this.linkMenuImageUpload({
        tenantId: scope.tenantId,
        menuItemId: updated.id,
        imageUrl: updated.image_url,
      });
    }

    if (hasVisibleBranches) {
      const visibleBranchIds = toUuidArray(body.visibleBranchIds, "visibleBranchIds");
      await this.repo.setMenuItemVisibility({
        tenantId: scope.tenantId,
        menuItemId,
        branchIds: visibleBranchIds,
      });
    }
    if (hasModifierGroups) {
      const modifierGroupIds = toUuidArray(body.modifierGroupIds, "modifierGroupIds");
      await this.repo.setModifierGroupsForMenuItem({
        tenantId: scope.tenantId,
        menuItemId,
        groupIds: modifierGroupIds,
      });
    }

    const visibleBranchIds = await this.repo.listVisibleBranchIdsForMenuItem({
      tenantId: scope.tenantId,
      menuItemId,
    });
    const modifierGroupIds = await this.repo.listModifierGroupIdsForMenuItem({
      tenantId: scope.tenantId,
      menuItemId,
    });

    return {
      id: updated.id,
      tenantId: updated.tenant_id,
      name: updated.name,
      basePrice: updated.base_price,
      categoryId: updated.category_id,
      status: updated.status,
      visibleBranchIds,
      modifierGroupIds,
      imageUrl: updated.image_url,
      createdAt: updated.created_at.toISOString(),
      updatedAt: updated.updated_at.toISOString(),
    };
  }

  private async linkMenuImageUpload(input: {
    tenantId: string;
    menuItemId: string;
    imageUrl: string | null;
  }): Promise<void> {
    if (!this.mediaUploadsRepo || !input.imageUrl) {
      return;
    }

    const objectKey = deriveObjectKeyFromImageUrl({
      imageUrl: input.imageUrl,
      tenantId: input.tenantId,
      area: "menu",
    });

    await this.mediaUploadsRepo.markLinkedUploadByReference({
      tenantId: input.tenantId,
      area: "menu",
      imageUrl: input.imageUrl,
      objectKey,
      linkedEntityType: "menu_item",
      linkedEntityId: input.menuItemId,
    });
  }

  async archiveMenuItem(input: {
    actor: ActorContext;
    menuItemId: string;
  }) {
    const scope = assertBranchContext(input.actor);
    const menuItemId = requireUuid(input.menuItemId, "menuItemId");
    const archived = await this.repo.updateMenuItemStatus({
      tenantId: scope.tenantId,
      menuItemId,
      status: "ARCHIVED",
    });
    if (!archived) {
      throw new V0MenuError(404, "menu item not found", "MENU_ITEM_NOT_FOUND");
    }
    return {
      id: archived.id,
      status: archived.status,
      updatedAt: archived.updated_at.toISOString(),
    };
  }

  async restoreMenuItem(input: {
    actor: ActorContext;
    menuItemId: string;
  }) {
    const scope = assertBranchContext(input.actor);
    const menuItemId = requireUuid(input.menuItemId, "menuItemId");
    const restored = await this.repo.updateMenuItemStatus({
      tenantId: scope.tenantId,
      menuItemId,
      status: "ACTIVE",
    });
    if (!restored) {
      throw new V0MenuError(404, "menu item not found", "MENU_ITEM_NOT_FOUND");
    }
    return {
      id: restored.id,
      status: restored.status,
      updatedAt: restored.updated_at.toISOString(),
    };
  }

  async setMenuItemVisibility(input: {
    actor: ActorContext;
    menuItemId: string;
    body: unknown;
  }) {
    const scope = assertTenantContext(input.actor);
    const menuItemId = requireUuid(input.menuItemId, "menuItemId");
    const body = toObject(input.body);
    const visibleBranchIds = toUuidArray(body.visibleBranchIds, "visibleBranchIds");

    const item = await this.repo.getMenuItemById({
      tenantId: scope.tenantId,
      menuItemId,
    });
    if (!item) {
      throw new V0MenuError(404, "menu item not found", "MENU_ITEM_NOT_FOUND");
    }

    await this.repo.setMenuItemVisibility({
      tenantId: scope.tenantId,
      menuItemId,
      branchIds: visibleBranchIds,
    });

    return {
      menuItemId,
      visibleBranchIds,
      updatedAt: new Date().toISOString(),
    };
  }

  async upsertComposition(input: {
    actor: ActorContext;
    menuItemId: string;
    body: unknown;
  }) {
    const scope = assertBranchContext(input.actor);
    const menuItemId = requireUuid(input.menuItemId, "menuItemId");
    const body = toObject(input.body);
    const baseComponents = toComponentArray(body.baseComponents);
    const optionDeltas = toModifierOptionDeltaArray(body.modifierOptionDeltas);

    const hasTracked =
      baseComponents.some((component) => component.trackingMode === "TRACKED") ||
      optionDeltas.some((entry) =>
        entry.deltas.some((delta) => delta.trackingMode === "TRACKED")
      );

    if (hasTracked) {
      const inventoryEnabled = await this.repo.isBranchEntitlementEnabled({
        tenantId: scope.tenantId,
        branchId: scope.branchId,
        entitlementKey: "module.inventory",
      });
      if (!inventoryEnabled) {
        throw new V0MenuError(
          403,
          "inventory entitlement required for tracked components",
          "INVENTORY_ENTITLEMENT_REQUIRED_FOR_TRACKED_COMPONENTS"
        );
      }
    }

    const item = await this.repo.getMenuItemById({
      tenantId: scope.tenantId,
      menuItemId,
    });
    if (!item) {
      throw new V0MenuError(404, "menu item not found", "MENU_ITEM_NOT_FOUND");
    }

    await this.repo.setBaseComponentsForMenuItem({
      tenantId: scope.tenantId,
      menuItemId,
      components: baseComponents,
    });
    for (const entry of optionDeltas) {
      await this.repo.setComponentDeltasForModifierOption({
        tenantId: scope.tenantId,
        modifierOptionId: entry.modifierOptionId,
        deltas: entry.deltas.map((delta) => ({
          stockItemId: delta.stockItemId,
          quantityDeltaInBaseUnit: delta.quantityDeltaInBaseUnit,
          trackingMode: delta.trackingMode,
        })),
      });
    }

    return {
      menuItemId,
      baseComponents,
      modifierOptionDeltas: optionDeltas,
      updatedAt: new Date().toISOString(),
    };
  }

  async evaluateComposition(input: {
    actor: ActorContext;
    menuItemId: string;
    body: unknown;
  }) {
    const scope = assertTenantContext(input.actor);
    const menuItemId = requireUuid(input.menuItemId, "menuItemId");
    const body = toObject(input.body);
    const selectedModifierOptionIds = toUuidArray(
      body.selectedModifierOptionIds,
      "selectedModifierOptionIds"
    );
    const menuItem = await this.repo.getMenuItemById({
      tenantId: scope.tenantId,
      menuItemId,
    });
    if (!menuItem) {
      throw new V0MenuError(404, "menu item not found", "MENU_ITEM_NOT_FOUND");
    }

    const baseComponents = await this.repo.listBaseComponentsForMenuItem({
      tenantId: scope.tenantId,
      menuItemId,
    });
    const deltas = await this.repo.listComponentDeltasByModifierOptionIds({
      tenantId: scope.tenantId,
      modifierOptionIds: selectedModifierOptionIds,
    });

    const aggregated = aggregateComponents(baseComponents, deltas);
    const components = Object.values(aggregated)
      .filter((entry) => entry.quantityInBaseUnit > 0)
      .map((entry) => ({
        stockItemId: entry.stockItemId,
        quantityInBaseUnit: entry.quantityInBaseUnit,
        trackingMode: entry.trackingMode,
      }))
      .sort((a, b) => a.stockItemId.localeCompare(b.stockItemId));

    return {
      menuItemId,
      components,
    };
  }
}

async function assertInventoryEntitlementForTrackedComponents(
  repo: V0MenuRepository,
  actor: ActorContext,
  tenantId: string
): Promise<void> {
  const branchScope = assertBranchContext(actor);
  if (branchScope.tenantId !== tenantId) {
    throw new V0MenuError(403, "branch context does not match tenant context");
  }
  const inventoryEnabled = await repo.isBranchEntitlementEnabled({
    tenantId,
    branchId: branchScope.branchId,
    entitlementKey: "module.inventory",
  });
  if (!inventoryEnabled) {
    throw new V0MenuError(
      403,
      "inventory entitlement required for tracked components",
      "INVENTORY_ENTITLEMENT_REQUIRED_FOR_TRACKED_COMPONENTS"
    );
  }
}

function aggregateComponents(
  baseComponents: ReadonlyArray<{
    stock_item_id: string;
    quantity_in_base_unit: number;
    tracking_mode: MenuTrackingMode;
  }>,
  deltas: ReadonlyArray<MenuModifierOptionDeltaRow>
): Record<
  string,
  {
    stockItemId: string;
    trackingMode: MenuTrackingMode;
    quantityInBaseUnit: number;
  }
> {
  const out: Record<
    string,
    {
      stockItemId: string;
      trackingMode: MenuTrackingMode;
      quantityInBaseUnit: number;
    }
  > = {};

  const apply = (entry: {
    stockItemId: string;
    trackingMode: MenuTrackingMode;
    amount: number;
  }) => {
    const key = `${entry.stockItemId}:${entry.trackingMode}`;
    const existing = out[key];
    if (!existing) {
      out[key] = {
        stockItemId: entry.stockItemId,
        trackingMode: entry.trackingMode,
        quantityInBaseUnit: entry.amount,
      };
      return;
    }
    existing.quantityInBaseUnit += entry.amount;
    if (existing.quantityInBaseUnit < 0) {
      throw new V0MenuError(
        422,
        "composition aggregate cannot produce negative component quantity",
        "MENU_COMPONENT_NEGATIVE_QUANTITY"
      );
    }
  };

  for (const component of baseComponents) {
    apply({
      stockItemId: component.stock_item_id,
      trackingMode: component.tracking_mode,
      amount: component.quantity_in_base_unit,
    });
  }

  for (const delta of deltas) {
    apply({
      stockItemId: delta.stock_item_id,
      trackingMode: delta.tracking_mode,
      amount: delta.quantity_delta_in_base_unit,
    });
  }

  return out;
}

function assertTenantContext(actor: ActorContext): {
  accountId: string;
  tenantId: string;
  branchId: string | null;
} {
  const accountId = requireNonEmptyString(actor.accountId, "accountId", 401);
  const tenantId = requireNonEmptyString(
    actor.tenantId,
    "tenant context required",
    403,
    "TENANT_CONTEXT_REQUIRED"
  );
  return { accountId, tenantId, branchId: actor.branchId ?? null };
}

function assertBranchContext(actor: ActorContext): {
  accountId: string;
  tenantId: string;
  branchId: string;
} {
  const tenantScope = assertTenantContext(actor);
  const branchId = requireNonEmptyString(
    tenantScope.branchId,
    "branch context required",
    403,
    "BRANCH_CONTEXT_REQUIRED"
  );
  return {
    accountId: tenantScope.accountId,
    tenantId: tenantScope.tenantId,
    branchId,
  };
}

function normalizeStatusFilter(input?: string): StatusFilter {
  const value = String(input ?? "").trim().toLowerCase();
  if (!value || value === "active") {
    return "active";
  }
  if (value === "archived") {
    return "archived";
  }
  if (value === "all") {
    return "all";
  }
  throw new V0MenuError(422, "status must be active, archived, or all");
}

function mapStatusFilter(status: StatusFilter): MenuActiveStatus | null {
  if (status === "all") {
    return null;
  }
  return status === "active" ? "ACTIVE" : "ARCHIVED";
}

function normalizeLimit(value: unknown): number {
  const parsed = Number(value ?? 50);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }
  return Math.min(Math.floor(parsed), 200);
}

function normalizeOffset(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.floor(parsed);
}

function toObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new V0MenuError(422, "request body must be an object");
  }
  return input as Record<string, unknown>;
}

function hasOwn(input: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function requireNonEmptyString(
  value: unknown,
  fieldName: string,
  statusCode = 422,
  code?: string
): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new V0MenuError(statusCode, `${fieldName} is required`, code);
  }
  return normalized;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function requireUuid(value: unknown, fieldName: string): string {
  const normalized = requireNonEmptyString(value, fieldName);
  if (!isUuid(normalized)) {
    throw new V0MenuError(422, `${fieldName} must be a valid UUID`);
  }
  return normalized;
}

function optionalUuid(value: unknown, fieldName: string): string | null {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }
  if (!isUuid(normalized)) {
    throw new V0MenuError(422, `${fieldName} must be a valid UUID`);
  }
  return normalized;
}

function optionalString(value: unknown): string | null {
  const normalized = normalizeOptionalString(value);
  return normalized ? normalized : null;
}

function toUuidArray(value: unknown, fieldName: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new V0MenuError(422, `${fieldName} must be an array`);
  }
  return value.map((item, index) => requireUuid(item, `${fieldName}[${index}]`));
}

function toFiniteNumber(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new V0MenuError(422, `${fieldName} must be a finite number`);
  }
  return parsed;
}

function toNonNegativeNumber(value: unknown, fieldName: string): number {
  const parsed = toFiniteNumber(value, fieldName);
  if (parsed < 0) {
    throw new V0MenuError(422, `${fieldName} must be >= 0`);
  }
  return parsed;
}

function toNonNegativeInteger(value: unknown, fieldName: string): number {
  const parsed = toFiniteNumber(value, fieldName);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new V0MenuError(422, `${fieldName} must be an integer >= 0`);
  }
  return parsed;
}

function toBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new V0MenuError(422, `${fieldName} must be boolean`);
  }
  return value;
}

function normalizeSelectionMode(value: unknown): "SINGLE" | "MULTI" {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  if (normalized !== "SINGLE" && normalized !== "MULTI") {
    throw new V0MenuError(422, "selectionMode must be SINGLE or MULTI");
  }
  return normalized;
}

function toTrackingMode(value: unknown): MenuTrackingMode {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  if (normalized !== "TRACKED" && normalized !== "NOT_TRACKED") {
    throw new V0MenuError(422, "trackingMode must be TRACKED or NOT_TRACKED");
  }
  return normalized;
}

function toComponentArray(value: unknown): MenuComponentInput[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new V0MenuError(422, "baseComponents must be an array");
  }
  return value.map((entry, index) => {
    const item = toObject(entry);
    return {
      stockItemId: requireUuid(item.stockItemId, `baseComponents[${index}].stockItemId`),
      quantityInBaseUnit: toPositiveNumber(
        item.quantityInBaseUnit,
        `baseComponents[${index}].quantityInBaseUnit`
      ),
      trackingMode: toTrackingMode(item.trackingMode),
    };
  });
}

function toModifierOptionDeltaArray(value: unknown): Array<{
  modifierOptionId: string;
  deltas: Array<{
    stockItemId: string;
    quantityDeltaInBaseUnit: number;
    trackingMode: MenuTrackingMode;
  }>;
}> {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new V0MenuError(422, "modifierOptionDeltas must be an array");
  }
  return value.map((entry, index) => {
    const item = toObject(entry);
    const modifierOptionId = requireUuid(
      item.modifierOptionId,
      `modifierOptionDeltas[${index}].modifierOptionId`
    );
    if (!Array.isArray(item.deltas)) {
      throw new V0MenuError(422, `modifierOptionDeltas[${index}].deltas must be an array`);
    }
    const deltas = item.deltas.map((deltaEntry, deltaIndex) => {
      const delta = toObject(deltaEntry);
      return {
        stockItemId: requireUuid(
          delta.stockItemId,
          `modifierOptionDeltas[${index}].deltas[${deltaIndex}].stockItemId`
        ),
        quantityDeltaInBaseUnit: toNonZeroNumber(
          delta.quantityDeltaInBaseUnit,
          `modifierOptionDeltas[${index}].deltas[${deltaIndex}].quantityDeltaInBaseUnit`
        ),
        trackingMode: toTrackingMode(delta.trackingMode),
      };
    });
    return {
      modifierOptionId,
      deltas,
    };
  });
}

function toComponentDeltaArray(
  value: unknown,
  fieldName: string
): Array<{
  stockItemId: string;
  quantityDeltaInBaseUnit: number;
  trackingMode: MenuTrackingMode;
}> {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new V0MenuError(422, `${fieldName} must be an array`);
  }
  return value.map((entry, index) => {
    const item = toObject(entry);
    return {
      stockItemId: requireUuid(item.stockItemId, `${fieldName}[${index}].stockItemId`),
      quantityDeltaInBaseUnit: toNonZeroNumber(
        item.quantityDeltaInBaseUnit,
        `${fieldName}[${index}].quantityDeltaInBaseUnit`
      ),
      trackingMode: toTrackingMode(item.trackingMode),
    };
  });
}

function toPositiveNumber(value: unknown, fieldName: string): number {
  const parsed = toFiniteNumber(value, fieldName);
  if (parsed <= 0) {
    throw new V0MenuError(422, `${fieldName} must be > 0`);
  }
  return parsed;
}

function toNonZeroNumber(value: unknown, fieldName: string): number {
  const parsed = toFiniteNumber(value, fieldName);
  if (parsed === 0) {
    throw new V0MenuError(422, `${fieldName} must not be 0`);
  }
  return parsed;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
