import { CategoryRepository } from "../../infra/repositories/category.js";
import { TenantLimitsRepository } from "../../infra/repositories/tenantLimits.js";
import { PolicyRepository } from "../../infra/repositories/policyAdapter.js";
import { EventBusAdapter } from "../../infra/repositories/eventBus.js";
import { MenuItemRepository } from "#modules/menu/infra/repositories/menuItem.js";
import { TransactionManager } from "../../../../shared/transactionManager.js";
import { pool } from "../../../../platform/db/index.js";
import type {
  ICategoryRepository,
  ITenantLimitsRepository,
  IPolicyPort,
  IEventBus,
  ITransactionManager,
  IMenuItemRepository
} from "../../app/ports.js";
import {
  CreateCategoryUseCase,
  ListCategoriesUseCase,
  UpdateCategoryUseCase,
  DeleteCategoryUseCase,
} from "../../app/use-cases/category/index.js";

export class CategoryFactory {
  static build() {
    const categoryRepo: ICategoryRepository = new CategoryRepository(pool);
    const limitsRepo: ITenantLimitsRepository = new TenantLimitsRepository(
      pool
    );
    const menuItemRepo: IMenuItemRepository = new MenuItemRepository(pool);
    const policyPort: IPolicyPort = new PolicyRepository(pool);
    const txManager: ITransactionManager = new TransactionManager();
    const eventBus: IEventBus = new EventBusAdapter();

    return {
      createCategoryUseCase: new CreateCategoryUseCase(
        categoryRepo,
        limitsRepo,
        policyPort,
        eventBus,
        txManager
      ),
      listCategoriesUseCase: new ListCategoriesUseCase(categoryRepo),
      updateCategoryUseCase: new UpdateCategoryUseCase(
        categoryRepo,
        policyPort,
        eventBus,
        txManager
      ),
      deleteCategoryUseCase: new DeleteCategoryUseCase(
        categoryRepo,
        menuItemRepo,
        policyPort
      ),
    };
  }
}
