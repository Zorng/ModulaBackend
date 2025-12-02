import { Pool } from "pg";
import { createInventoryRouter } from "./api/router.js";
import { AuthMiddleware } from "../auth/api/middleware/auth.middleware.js";
import { TransactionManager } from "../../platform/db/transactionManager.js";
import { publishToOutbox } from "../../platform/events/outbox.js";

// Repositories
import { StockItemRepository } from "./infra/stockItem.repository.js";
import { BranchStockRepository } from "./infra/branchStock.repository.js";
import { InventoryJournalRepository } from "./infra/InventoryJournal.repository.js";
import { MenuStockMapRepository } from "./infra/MenuStockMap.repository.js";
import { StorePolicyInventoryRepository } from "./infra/storePolicyInventory.repository.js";
import { InventoryCategoryRepository } from "./infra/inventoryCategory.repository.js";

// Controllers
import {
  StockItemController,
  BranchStockController,
  InventoryJournalController,
  MenuStockMapController,
  StorePolicyController,
  CategoryController,
} from "./api/controller/index.js";

// Use Cases - Stock Item
import { CreateStockItemUseCase } from "./app/stockitem-usecase/create-stock-item.use-case.js";
import { UpdateStockItemUseCase } from "./app/stockitem-usecase/update-stock-item.use-case.js";
import { GetStockItemsUseCase } from "./app/stockitem-usecase/get-stock-items.use-case.js";

// Use Cases - Branch Stock
import { AssignStockItemToBranchUseCase } from "./app/branchstock-usecase/assign-stock-item-to-branch.use-case.js";
import { GetBranchStockItemsUseCase } from "./app/branchstock-usecase/get-branch-stock-items.use-case.js";

// Use Cases - Inventory Journal
import { ReceiveStockUseCase } from "./app/inventoryjournal-usecase/receive-stock.use-case.js";
import { WasteStockUseCase } from "./app/inventoryjournal-usecase/waste-stock.use-case.js";
import { CorrectStockUseCase } from "./app/inventoryjournal-usecase/correct-stock.use-case.js";
import { RecordSaleDeductionsUseCase } from "./app/inventoryjournal-usecase/record-sale-deductions.use-case.js";
import { RecordVoidUseCase } from "./app/inventoryjournal-usecase/record-void.use-case.js";
import { RecordReopenUseCase } from "./app/inventoryjournal-usecase/record-reopen.use-case.js";
import { GetOnHandUseCase } from "./app/inventoryjournal-usecase/get-on-hand.use-case.js";
import { GetInventoryJournalUseCase } from "./app/inventoryjournal-usecase/get-inventory-journal.use-case.js";
import { GetLowStockAlertsUseCase } from "./app/inventoryjournal-usecase/get-low-stock-alerts.use-case.js";
import { GetInventoryExceptionsUseCase } from "./app/inventoryjournal-usecase/get-inventory-exceptions.use-case.js";

// Use Cases - Menu Stock Map
import { SetMenuStockMapUseCase } from "./app/menustockmap-usecase/set-menu-stock-map.use-case.js";
import { GetMenuStockMapUseCase } from "./app/menustockmap-usecase/get-menu-stock-map.use-case.js";
import { DeleteMenuStockMapUseCase } from "./app/menustockmap-usecase/delete-menu-stock-map.use-case.js";

// Use Cases - Store Policy
import { GetStorePolicyInventoryUseCase } from "./app/storepolicyinventory-usecase/get-store-policy-inventory.use-case.js";
import { UpdateStorePolicyInventoryUseCase } from "./app/storepolicyinventory-usecase/update-store-policy-inventory.use-case.js";

// Use Cases - Category
import {
  CreateCategoryUseCase,
  GetCategoriesUseCase,
  UpdateCategoryUseCase,
  DeleteCategoryUseCase,
} from "./app/category-usecase/index.js";

// Event Handlers
import {
  SaleFinalizedHandler,
  SaleVoidedHandler,
  SaleReopenedHandler,
} from "./app/event-handlers/index.js";

export function bootstrapInventoryModule(
  pool: Pool,
  authMiddleware: AuthMiddleware
) {
  const txManager = new TransactionManager();

  // Create event publisher adapter
  const eventPublisher = {
    publishViaOutbox: publishToOutbox,
  };

  // Initialize repositories
  const stockItemRepo = new StockItemRepository(pool);
  const branchStockRepo = new BranchStockRepository(pool);
  const journalRepo = new InventoryJournalRepository(pool);
  const menuStockMapRepo = new MenuStockMapRepository(pool);
  const storePolicyRepo = new StorePolicyInventoryRepository(pool);
  const categoryRepo = new InventoryCategoryRepository(pool);

  // Initialize use cases - Stock Item
  const createStockItemUseCase = new CreateStockItemUseCase(
    stockItemRepo,
    eventPublisher,
    txManager
  );
  const updateStockItemUseCase = new UpdateStockItemUseCase(
    stockItemRepo,
    eventPublisher,
    txManager
  );
  const getStockItemsUseCase = new GetStockItemsUseCase(stockItemRepo);

  // Initialize use cases - Branch Stock
  const assignStockItemToBranchUseCase = new AssignStockItemToBranchUseCase(
    branchStockRepo,
    stockItemRepo
  );
  const getBranchStockItemsUseCase = new GetBranchStockItemsUseCase(
    branchStockRepo,
    stockItemRepo
  );

  // Initialize use cases - Inventory Journal
  const receiveStockUseCase = new ReceiveStockUseCase(
    journalRepo,
    stockItemRepo,
    branchStockRepo,
    eventPublisher,
    txManager
  );
  const wasteStockUseCase = new WasteStockUseCase(
    journalRepo,
    branchStockRepo,
    eventPublisher,
    txManager
  );
  const correctStockUseCase = new CorrectStockUseCase(
    journalRepo,
    branchStockRepo,
    eventPublisher,
    txManager
  );
  const recordSaleDeductionsUseCase = new RecordSaleDeductionsUseCase(
    journalRepo,
    eventPublisher,
    txManager
  );
  const recordVoidUseCase = new RecordVoidUseCase(
    journalRepo,
    eventPublisher,
    txManager
  );
  const recordReopenUseCase = new RecordReopenUseCase(
    journalRepo,
    eventPublisher,
    txManager
  );
  const getOnHandUseCase = new GetOnHandUseCase(journalRepo, branchStockRepo);
  const getInventoryJournalUseCase = new GetInventoryJournalUseCase(
    journalRepo
  );
  const getLowStockAlertsUseCase = new GetLowStockAlertsUseCase(
    journalRepo,
    stockItemRepo
  );
  const getInventoryExceptionsUseCase = new GetInventoryExceptionsUseCase(
    journalRepo,
    stockItemRepo,
    branchStockRepo
  );

  // Initialize use cases - Menu Stock Map
  const setMenuStockMapUseCase = new SetMenuStockMapUseCase(
    menuStockMapRepo,
    stockItemRepo,
    eventPublisher,
    txManager
  );
  const getMenuStockMapUseCase = new GetMenuStockMapUseCase(menuStockMapRepo);
  const deleteMenuStockMapUseCase = new DeleteMenuStockMapUseCase(
    menuStockMapRepo
  );

  // Initialize use cases - Store Policy
  const getStorePolicyInventoryUseCase = new GetStorePolicyInventoryUseCase(
    storePolicyRepo
  );
  const updateStorePolicyInventoryUseCase =
    new UpdateStorePolicyInventoryUseCase(
      storePolicyRepo,
      eventPublisher,
      txManager
    );

  // Initialize use cases - Category
  const createCategoryUseCase = new CreateCategoryUseCase(
    categoryRepo,
    eventPublisher,
    txManager
  );
  const getCategoriesUseCase = new GetCategoriesUseCase(categoryRepo);
  const updateCategoryUseCase = new UpdateCategoryUseCase(
    categoryRepo,
    eventPublisher,
    txManager
  );
  const deleteCategoryUseCase = new DeleteCategoryUseCase(
    categoryRepo,
    stockItemRepo,
    eventPublisher,
    txManager
  );

  // Create controllers
  const stockItemController = new StockItemController(
    createStockItemUseCase,
    updateStockItemUseCase,
    getStockItemsUseCase
  );

  const branchStockController = new BranchStockController(
    assignStockItemToBranchUseCase,
    getBranchStockItemsUseCase
  );

  const inventoryJournalController = new InventoryJournalController(
    receiveStockUseCase,
    wasteStockUseCase,
    correctStockUseCase,
    recordSaleDeductionsUseCase,
    recordVoidUseCase,
    recordReopenUseCase,
    getOnHandUseCase,
    getInventoryJournalUseCase,
    getLowStockAlertsUseCase,
    getInventoryExceptionsUseCase
  );

  const menuStockMapController = new MenuStockMapController(
    setMenuStockMapUseCase,
    getMenuStockMapUseCase,
    deleteMenuStockMapUseCase
  );

  const storePolicyController = new StorePolicyController(
    getStorePolicyInventoryUseCase,
    updateStorePolicyInventoryUseCase
  );

  const categoryController = new CategoryController(
    createCategoryUseCase,
    getCategoriesUseCase,
    updateCategoryUseCase,
    deleteCategoryUseCase
  );

  // Initialize event handlers
  const saleFinalizedHandler = new SaleFinalizedHandler(
    getStorePolicyInventoryUseCase,
    getMenuStockMapUseCase,
    recordSaleDeductionsUseCase
  );

  const saleVoidedHandler = new SaleVoidedHandler(
    getMenuStockMapUseCase,
    recordVoidUseCase
  );

  const saleReopenedHandler = new SaleReopenedHandler(
    getStorePolicyInventoryUseCase,
    getMenuStockMapUseCase,
    recordReopenUseCase,
    pool
  );

  // Create and return router
  const router = createInventoryRouter(
    stockItemController,
    branchStockController,
    inventoryJournalController,
    menuStockMapController,
    storePolicyController,
    categoryController,
    authMiddleware
  );

  return {
    router,
    eventHandlers: {
      saleFinalizedHandler,
      saleVoidedHandler,
      saleReopenedHandler,
    },
  };
}
