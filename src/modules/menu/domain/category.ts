/**
 * Category Entity
 * Represents a menu category (Coffee, Tea, Juice, etc.)
 */

import type { Result } from "../../../shared/result.js";

export type CategoryProps = {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  displayOrder: number;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export class Category {
  private constructor(private props: CategoryProps) {}

  // Factory: Create new category (validates business rules)
  static create(data: {
    id: string;
    tenantId: string;
    name: string;
    description?: string;
    displayOrder: number;
    createdBy: string;
  }): Result<Category, string> {
    // Validate name is not empty
    if (!data.name || data.name.trim().length === 0) {
      return { ok: false, error: "Category name cannot be empty." };
    }
    // Validate name length (max 100 chars)
    if (data.name.length > 100) {
      return {
        ok: false,
        error: "Category name cannot be more than 100 characters.",
      };
    }
    // Validate displayOrder >= 0
    if (data.displayOrder < 0) {
      return { ok: false, error: "Display order cannot be negative." };
    }

    return {
      ok: true,
      value: new Category({
        ...data,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    };
  }

  // Factory: Reconstitute from database
  static fromPersistence(props: CategoryProps): Category {
    return new Category(props);
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
  get description() {
    return this.props.description;
  }
  get displayOrder() {
    return this.props.displayOrder;
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
    // Validate new name
    // Check if newName is empty or only whitespace
    if (!newName || newName.trim().length === 0)
      return { ok: false, error: "Category name cannot be empty." };
    // Check if newName.length > 100
    if (newName.length > 100)
      return {
        ok: false,
        error: "Category name cannot be more than 100 characters",
      };

    // Update this.props.name
    this.props.name = newName.trim();
    // Update this.props.updatedAt
    this.props.updatedAt = new Date();

    return { ok: true, value: undefined };
  }

  // changes the display order of categories in the POS interface.
  reorder(newOrder: number): Result<void, string> {
    //  Validate newOrder >= 0
    if (newOrder < 0)
      return { ok: false, error: "Display order cannot be negative." };
    
    this.props.displayOrder = newOrder;
    this.props.updatedAt = new Date();

    return { ok: true, value: undefined };
  }

  deactivate(): void {
    this.props.isActive = false;
    this.props.updatedAt = new Date();
  }

  activate(): void {
    this.props.isActive = true;
    this.props.updatedAt = new Date();
  }

  // Return props for persistence
  toPersistence(): CategoryProps {
    return { ...this.props };
  }
}
