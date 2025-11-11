// TODO: Define Menu entities
// Example: MenuItem, Category, Modifier, MenuStockMap

export interface MenuItem {
  id: string;
  tenantId: string;
  categoryId: string;
  name: string;
  description?: string;
  price: number;
  isAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Category {
  id: string;
  tenantId: string;
  name: string;
  sortOrder: number;
}

export interface Modifier {
  id: string;
  tenantId: string;
  name: string;
  price: number;
}

export interface MenuStockMap {
  menuItemId: string;
  stockItemId: string;
  quantityPerUnit: number; // How much stock is used per menu item
}
