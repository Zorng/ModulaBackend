/**
 * MenuStockMap Value Object
 * Links menu items to inventory stock items for automatic deduction
 */

import type { Result } from "../../../shared/result.js";

export type MenuStockMapProps = {
  menuItemId: string;
  stockItemId: string;
  qtyPerSale: number; // Decimal quantity deducted per sale
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export class MenuStockMap {
  private constructor(private props: MenuStockMapProps) {}

  // Factory: Create stock mapping
  static create(data: {
    menuItemId: string;
    stockItemId: string;
    qtyPerSale: number;
    createdBy: string;
  }): Result<MenuStockMap, string> {
    // Validate qtyPerSale > 0
    if (data.qtyPerSale <= 0) {
      return { ok: false, error: "Quantity per sale must be greater than 0" };
    }

    // Validate stockItemId is not empty
    if (!data.stockItemId || data.stockItemId.trim().length === 0) {
      return { ok: false, error: "Stock item ID cannot be empty" };
    }

    return {
      ok: true,
      value: new MenuStockMap({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    };
  }

  static fromPersistence(props: MenuStockMapProps): MenuStockMap {
    return new MenuStockMap(props);
  }

  // Getters
  get menuItemId() {
    return this.props.menuItemId;
  }
  get stockItemId() {
    return this.props.stockItemId;
  }
  get qtyPerSale() {
    return this.props.qtyPerSale;
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

  // Business method
  updateQuantity(newQty: number): Result<void, string> {
    // Validate newQty > 0
    if (newQty <= 0) {
      return { ok: false, error: "Quantity must be greater than 0" };
    }

    // Update quantity and timestamp
    this.props.qtyPerSale = newQty;
    this.props.updatedAt = new Date();

    return { ok: true, value: undefined };
  }

  toPersistence(): MenuStockMapProps {
    return { ...this.props };
  }
}
