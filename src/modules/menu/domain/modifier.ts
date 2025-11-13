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
  selectionType: "SINGLE" | "MULTI"; // SINGLE = radio buttons, MULTI = checkboxes
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export class ModifierGroup {
  private constructor(private props: ModifierGroupProps) {}

  // Factory: Create new modifier group
  static create(data: {
    id: string;
    tenantId: string;
    name: string;
    selectionType: "SINGLE" | "MULTI";
    createdBy: string;
  }): Result<ModifierGroup, string> {
    //Validate name not empty
    if (!data.name || data.name.trim().length === 0) return {ok:false, error: 'Modifier Group name cannot be empty.'};
    if (data.name.length > 100) return { ok: false, error: "Modifier Group name cannot be more than 100 characters." };

    // Validate selectionType is valid enum
    if (data.selectionType !== 'SINGLE' && data.selectionType !== 'MULTI') return { ok: false, error: 'Selection type must be SINGLE or MULTI' }

    return {
      ok: true,
      value: new ModifierGroup({
        ...data,
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
  get createdBy() {
    return this.props.createdBy;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }

  toPersistence(): ModifierGroupProps {
    return { ...this.props };
  }
}


export type ModifierOptionProps = {
  id: string;
  modifierGroupId: string;
  label: string;
  priceAdjustmentUsd: number; // Can be negative, zero, or positive
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export class ModifierOption {
  private constructor(private props: ModifierOptionProps) {}

  // Factory: Create new modifier option
  static create(data: {
    id: string;
    modifierGroupId: string;
    label: string;
    priceAdjustmentUsd: number;
    isDefault?: boolean;
  }): Result<ModifierOption, string> {
    //  Validate label not empty
    if (!data.label || data.label.trim().length === 0)
      return { ok: false, error: "Modifier option name cannot be empty." };

    //  Validate label length (max 100 chars)
     if (data.label.length > 100) return {ok:false, error: 'Modifier option name cannot be empty.'};

    return {
      ok: true,
      value: new ModifierOption({
        ...data,
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

  toPersistence(): ModifierOptionProps {
    return { ...this.props };
  }
}
