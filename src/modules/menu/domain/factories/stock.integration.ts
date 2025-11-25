import { MenuItemRepository } from "../../infra/repositories/menuItem.js";
import { MenuStockMapRepository } from "../../infra/repositories/menuStockMap.js";
import { PolicyAdapter } from "../../infra/repositories/policyAdapter.js";
import { InventoryAdapter } from "../../infra/repositories/inventoryAdapter.js";
import { pool } from "../../../../platform/db/index.js";
import { TransactionManager } from "../../../../platform/db/transactionManager.js";
import type {
  IMenuItemRepository,
  IMenuStockMapRepository,
  IPolicyPort,
  IInventoryPort,
  ITransactionManager
} from "../../app/ports.js";
import {
  LinkMenuItemToStockUseCase,
  UnlinkMenuItemFromStockUseCase,
} from "../../app/use-cases/stock-integration/index.js";

export class StockIntegrationFactory {
  static build() {
    const menuItemRepo: IMenuItemRepository = new MenuItemRepository(pool);
    const stockMapRepo: IMenuStockMapRepository = new MenuStockMapRepository(
      pool
    );
    const policyPort: IPolicyPort = new PolicyAdapter(pool);
    const inventoryPort: IInventoryPort = new InventoryAdapter(pool);
    const txManager: ITransactionManager = new TransactionManager();
    

    return {
      linkMenuItemToStockUseCase: new LinkMenuItemToStockUseCase(
        menuItemRepo,
        stockMapRepo,
        inventoryPort,
        policyPort,
        txManager
      ),
      unlinkMenuItemFromStockUseCase: new UnlinkMenuItemFromStockUseCase(
        stockMapRepo,
        policyPort,
        txManager
      ),
    };
  }
}
