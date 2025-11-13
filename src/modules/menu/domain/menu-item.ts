/**
 * MenuItem Entity
 * Represents an individual menu item (Iced Latte, Orange Juice, etc.)
 */

import type { Result } from "../../../shared/result.js";

export type MenuItemProps = {
  id: string;
  tenantId: string;
  categoryId: string;
  name: string;
  description?: string;
  priceUsd: number;
  imageUrl?: string;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export class MenuItem {
  private constructor(private props: MenuItemProps) {}

  // Factory: Create new menu item
  static create(data: {
    id: string;
    tenantId: string;
    categoryId: string;
    name: string;
    description?: string;
    priceUsd: number;
    imageUrl?: string;
    createdBy: string;
  }): Result<MenuItem, string> {
    // Validate name not empty
    if(!data.name || data.name.trim().length === 0 ) return {ok:false, error: 'Menu Item name can not be empty.'};  

    // Validate name length (max 200 chars)
    if(data.name.length > 200) return {ok:false, error: 'Menu Item name cannot be more than 200 characters.'};

    // Validate priceUsd >= 0
    if(data.priceUsd < 0 ) return {  ok: false,  error: "Menu Item price cannot negative.",};

    // Validate imageUrl format if provided
    if (data.imageUrl) {
      const validExtensions = ['.jpg', '.jpeg', '.webp', '.png'];
      const hasValidExtension = validExtensions.some(ext => data.imageUrl?.toLowerCase().endsWith(ext));
      
      if(!hasValidExtension) return  {ok: false, error: 'File not supported.'};
    }

    return {
      ok: true,
      value: new MenuItem({
        ...data,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    };
  }

  // Factory: Reconstitute from database
  static fromPersistence(props: MenuItemProps): MenuItem {
    return new MenuItem(props);
  }

  // Getters
  get id() {
    return this.props.id;
  }
  get tenantId() {
    return this.props.tenantId;
  }
  get categoryId() {
    return this.props.categoryId;
  }
  get name() {
    return this.props.name;
  }
  get description() {
    return this.props.description;
  }
  get priceUsd() {
    return this.props.priceUsd;
  }
  get imageUrl() {
    return this.props.imageUrl;
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
  updatePrice(newPrice: number): Result<void, string> {
    // Validate newPrice >= 0
    if (newPrice < 0) return { ok: false, error: 'Price cannot be negative' }

    this.props.priceUsd = newPrice
    this.props.updatedAt = new Date()

    return { ok: true, value: undefined };
  }

  updateDetails(data: {
    name?: string;
    description?: string;
    imageUrl?: string;
  }): Result<void, string> {
    // Validate name if provided
    if (data.name !== undefined) {
        if (data.name && data.name.trim().length === 0) return { ok:false, error: 'name cannot be empty'};
        if (data.name && data.name.length > 200) return { ok:false, error: 'name cannot be more than 200 characters.'};        
    }

    if (data.name !== undefined) this.props.name = data.name.trim();
    if (data.description !== undefined) this.props.description = data.description;
    if (data.imageUrl !== undefined) this.props.imageUrl = data.imageUrl;

    this.props.updatedAt = new Date()

    return { ok: true, value: undefined };
  }

  changeCategory(newCategoryId: string): void {
    this.props.categoryId = newCategoryId;
    this.props.updatedAt = new Date();
  }

  deactivate(): void {
    this.props.isActive = false; 
    this.props.updatedAt = new Date();
  }

  activate(): void {
    this.props.isActive = true
    this.props.updatedAt = new Date()
  }

  toPersistence(): MenuItemProps {
    return { ...this.props };
  }
}
