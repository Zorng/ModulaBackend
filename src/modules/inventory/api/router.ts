import {
  StockItemController,
  BranchStockController,
  InventoryJournalController,
  MenuStockMapController,
  StorePolicyController,
} from "./controller/index.js";
import { createInventoryRoutes } from "./inventory.routes.js";
import { AuthMiddleware } from "../../auth/api/middleware/auth.middleware.js";

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
  storePolicyController: StorePolicyController,
  authMiddleware: AuthMiddleware
) {
  return createInventoryRoutes(
    stockItemController,
    branchStockController,
    inventoryJournalController,
    menuStockMapController,
    storePolicyController,
    authMiddleware
  );
}

export type InventoryRouterFactory = (
  stockItemController: StockItemController,
  branchStockController: BranchStockController,
  inventoryJournalController: InventoryJournalController,
  menuStockMapController: MenuStockMapController,
  storePolicyController: StorePolicyController,
  authMiddleware: AuthMiddleware
) => ReturnType<typeof createInventoryRoutes>;
