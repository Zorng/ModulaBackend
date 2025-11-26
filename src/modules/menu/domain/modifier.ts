/**
 * Modifier Entities
 * ModifierGroup: Reusable groups like "Sugar Level", "Toppings"
 * ModifierOption: Individual options within a group like "No Sugar", "Extra Sugar"
 */

import type { Result } from "../../../shared/result.js";

export type ModifierGroupProps = {
  id: string;
  tenantId: string;
  name: string;
  selectionType: "SINGLE" | "MULTI";
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export class ModifierGroup {
  private constructor(private props: ModifierGroupProps) {}

  // Factory: Create new modifier group
  static create(data: {
    tenantId: string;
    name: string;
    selectionType: "SINGLE" | "MULTI";
    createdBy: string;
  }): Result<ModifierGroup, string> {
    const id = crypto.randomUUID(); // Generate UUID

    // Validate name not empty
    if (!data.name || data.name.trim().length === 0) {
      return { ok: false, error: "Modifier Group name cannot be empty." };
    }

    // Validate name length
    if (data.name.length > 100) {
      return {
        ok: false,
        error: "Modifier Group name cannot be more than 100 characters.",
      };
    }

    // Validate selectionType is valid enum
    if (data.selectionType !== "SINGLE" && data.selectionType !== "MULTI") {
      return { ok: false, error: "Selection type must be SINGLE or MULTI" };
    }

    return {
      ok: true,
      value: new ModifierGroup({
        id, // Use generated UUID
        tenantId: data.tenantId,
        name: data.name.trim(),
        selectionType: data.selectionType,
        isActive: true, // New groups are active by default
        createdBy: data.createdBy,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    };
  }

  static fromPersistence(props: ModifierGroupProps): ModifierGroup {
    return new ModifierGroup(props);
  }

  // Getters
  get id() {
    return this.props.id;
  }
  get tenantId() {
    return this.props.tenantId;
  }
  get name() {
    return this.props.name;
  }
  get selectionType() {
    return this.props.selectionType;
  }
  get isActive() {
    return this.props.isActive;
  }
  get createdBy() {
    return this.props.createdBy;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }

  // Business methods
  rename(newName: string): Result<void, string> {
    if (!newName || newName.trim().length === 0) {
      return { ok: false, error: "Modifier Group name cannot be empty." };
    }

    if (newName.length > 100) {
      return {
        ok: false,
        error: "Modifier Group name cannot be more than 100 characters.",
      };
    }

    this.props.name = newName.trim();
    this.props.updatedAt = new Date();

    return { ok: true, value: undefined };
  }

  changeSelectionType(selectionType: "SINGLE" | "MULTI"): Result<void, string> {
    if (selectionType !== "SINGLE" && selectionType !== "MULTI") {
      return {
        ok: false,
        error: "Selection type must be SINGLE or MULTI",
      };
    }

    this.props.selectionType = selectionType;
    this.props.updatedAt = new Date();

    return { ok: true, value: undefined };
  }

  activate(): void {
    this.props.isActive = true;
    this.props.updatedAt = new Date();
  }

  deactivate(): void {
    this.props.isActive = false;
    this.props.updatedAt = new Date();
  }

  toPersistence(): ModifierGroupProps {
    return { ...this.props };
  }
}

export type ModifierOptionProps = {
  id: string;
  modifierGroupId: string;
  label: string;
  priceAdjustmentUsd: number;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export class ModifierOption {
  private constructor(private props: ModifierOptionProps) {}

  // Factory: Create new modifier option
  static create(data: {
    modifierGroupId: string;
    label: string;
    priceAdjustmentUsd: number;
    isDefault?: boolean;
  }): Result<ModifierOption, string> {
    const id = crypto.randomUUID(); // Generate UUID

    // Validate label not empty
    if (!data.label || data.label.trim().length === 0) {
      return { ok: false, error: "Modifier option label cannot be empty." };
    }

    // Validate label length (max 100 chars)
    if (data.label.length > 100) {
      return {
        ok: false,
        error: "Modifier option label cannot be more than 100 characters.",
      };
    }

    return {
      ok: true,
      value: new ModifierOption({
        id, // Use generated UUID
        modifierGroupId: data.modifierGroupId,
        label: data.label.trim(),
        priceAdjustmentUsd: data.priceAdjustmentUsd,
        isDefault: data.isDefault ?? false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    };
  }

  static fromPersistence(props: ModifierOptionProps): ModifierOption {
    return new ModifierOption(props);
  }

  // Getters
  get id() {
    return this.props.id;
  }
  get modifierGroupId() {
    return this.props.modifierGroupId;
  }
  get label() {
    return this.props.label;
  }
  get priceAdjustmentUsd() {
    return this.props.priceAdjustmentUsd;
  }
  get isDefault() {
    return this.props.isDefault;
  }
  get isActive() {
    return this.props.isActive;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }

  // Business methods
  update(fields: {
    label?: string;
    priceAdjustmentUsd?: number;
    isDefault?: boolean;
    isActive?: boolean;
  }): Result<void, string> {
    const { label, priceAdjustmentUsd, isDefault, isActive } = fields;

    if (
      label === undefined &&
      priceAdjustmentUsd === undefined &&
      isDefault === undefined &&
      isActive === undefined
    ) {
      return { ok: false, error: "No fields provided to update." };
    }

    if (label !== undefined) {
      if (!label || label.trim().length === 0) {
        return { ok: false, error: "Modifier option label cannot be empty." };
      }

      if (label.length > 100) {
        return {
          ok: false,
          error: "Modifier option label cannot be more than 100 characters.",
        };
      }

      this.props.label = label.trim();
    }

    if (priceAdjustmentUsd !== undefined) {
      if (!Number.isFinite(priceAdjustmentUsd)) {
        return {
          ok: false,
          error: "Price adjustment must be a finite number.",
        };
      }

      this.props.priceAdjustmentUsd = priceAdjustmentUsd;
    }

    if (isDefault !== undefined) {
      this.props.isDefault = isDefault;
    }

    if (isActive !== undefined) {
      this.props.isActive = isActive;
    }

    this.props.updatedAt = new Date();

    return { ok: true, value: undefined };
  }

  toPersistence(): ModifierOptionProps {
    return { ...this.props };
  }
}
