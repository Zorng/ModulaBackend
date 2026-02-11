import {
  StockItemController,
  BranchStockController,
  InventoryJournalController,
  MenuStockMapController,
  CategoryController,
} from "./controller/index.js";
import { createInventoryRoutes } from "./inventory.routes.js";
import type { AuthMiddlewarePort } from "../../../platform/security/auth.js";

/**
 * Inventory Module Router
 *
 * Main router export for the inventory module that wires up the separate controllers
 * with all the route definitions and middleware.
 */

export function createInventoryRouter(
  stockItemController: StockItemController,
  branchStockController: BranchStockController,
  inventoryJournalController: InventoryJournalController,
  menuStockMapController: MenuStockMapController,
  categoryController: CategoryController,
  authMiddleware: AuthMiddlewarePort
) {
  return createInventoryRoutes(
    stockItemController,
    branchStockController,
    inventoryJournalController,
    menuStockMapController,
    categoryController,
    authMiddleware
  );
}

export type InventoryRouterFactory = (
  stockItemController: StockItemController,
  branchStockController: BranchStockController,
  inventoryJournalController: InventoryJournalController,
  menuStockMapController: MenuStockMapController,
  categoryController: CategoryController,
  authMiddleware: AuthMiddlewarePort
) => ReturnType<typeof createInventoryRoutes>;
