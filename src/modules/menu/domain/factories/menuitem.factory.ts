import { MenuItemRepository } from "../../infra/repositories/menuItem.js";
import { CategoryRepository } from "../../infra/repositories/category.js";
import { CloudflareR2ImageAdapter } from "../../infra/repositories/imageAdapter.js";
import { PolicyAdapter } from "../../infra/repositories/policyAdapter.js";
import { TenantLimitsRepository } from "#modules/menu/infra/repositories/tenantLimits.js";
import { EventBusAdapter } from "../../infra/repositories/eventBus.js";
import { TransactionManager } from "../../../../platform/db/transactionManager.js";
import { pool } from "../../../../platform/db/index.js";
import { BranchMenuRepository } from "../../infra/repositories/branchMenu.js";
import { GetMenuItemsByBranchUseCase } from "../../app/use-cases/menu-item/get-menu-items-by-branch.js";
import type {
  IMenuItemRepository,
  ICategoryRepository,
  IImageStoragePort,
  IPolicyPort,
  IEventBus,
  ITransactionManager,
  ITenantLimitsRepository,
  IBranchMenuRepository
} from "../../app/ports.js";
import {
  CreateMenuItemUseCase,
  GetMenuItemUseCase,
  UpdateMenuItemUseCase,
  DeleteMenuItemUseCase,
} from "../../app/use-cases/menu-item/index.js";

export class MenuItemFactory {
  static build() {
    const menuItemRepo: IMenuItemRepository = new MenuItemRepository(pool);
    const categoryRepo: ICategoryRepository = new CategoryRepository(pool);
    const imageStorage: IImageStoragePort = new CloudflareR2ImageAdapter();
    const limitsRepo: ITenantLimitsRepository = new TenantLimitsRepository(pool);
    const policyPort: IPolicyPort = new PolicyAdapter(pool);
    const eventBus: IEventBus = new EventBusAdapter();
    const txManager: ITransactionManager = new TransactionManager();
    const branchMenuRepo: IBranchMenuRepository = new BranchMenuRepository(pool);

    return {
      createMenuItemUseCase: new CreateMenuItemUseCase(
        menuItemRepo,
        categoryRepo,
        limitsRepo,
        imageStorage,
        policyPort,
        eventBus,
        txManager
      ),
      getMenuItemUseCase: new GetMenuItemUseCase(menuItemRepo),
      updateMenuItemUseCase: new UpdateMenuItemUseCase(
        menuItemRepo,
        categoryRepo,
        imageStorage,
        policyPort,
        eventBus,
        txManager
      ),
      deleteMenuItemUseCase: new DeleteMenuItemUseCase(
        menuItemRepo,
        policyPort,
        eventBus,
        txManager
      ),
      getMenuItemsByBranchUseCase: new GetMenuItemsByBranchUseCase(branchMenuRepo),
    };
  }
}
