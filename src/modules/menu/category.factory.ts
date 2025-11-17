import {
  CreateCategoryUseCase,
  ListCategoriesUseCase,
  UpdateCategoryUseCase,
  DeleteCategoryUseCase,
  CreateMenuItemUseCase,
  GetMenuItemUseCase,
  UpdateMenuItemUseCase,
  DeleteMenuItemUseCase,
  AddModifierOptionUseCase,
  AttachModifierToItemUseCase,
  CreateModifierGroupUseCase,
  GetMenuForBranchUseCase,
  LinkMenuItemToStockUseCase,
  UnlinkMenuItemFromStockUseCase,
} from "./app/use-cases/index.js";
import { CategoryRepository } from "./infra/repositories/category.js";
import { TenantLimitsRepository } from "./infra/repositories/tenantLimits.js";
import { MenuItemRepository } from "./infra/repositories/menuItem.js";
import { PolicyRepository } from "./infra/repositories/policyAdapter.js";
import { EventBusAdapter } from "./infra/repositories/eventBus.js";
import { pool } from "../../platform/db/index.js";
import { TransactionManager } from "../../shared/transactionManager.js";
import type { IEventBus, ITransactionManager } from "./app/ports.js";
import { eventBus } from "../../platform/events/index.js";

export class CategoryFactory {
  static build() {
    const categoryRepo = new CategoryRepository(pool);
    const policyRepo = new PolicyRepository(pool);
    const limitsRepo = new TenantLimitsRepository(pool);
    const txManager = new TransactionManager();
    const EventBus = new EventBusAdapter();

// Export instantiated use cases
    const createCategoryUseCase = new CreateCategoryUseCase(
    categoryRepo,
    limitsRepo,
    policyRepo,
    EventBus,
    txManager
    );

    const updateCategoryUseCase = new UpdateCategoryUseCase(
    categoryRepo,
    policyRepo,
    EventBus,
    txManager
    );

    const deleteCategoryUseCase = new DeleteCategoryUseCase(
    categoryRepo,
    policyRepo,
    eventBus,
    );

    const listCategoriesUseCase = new ListCategoriesUseCase(categoryRepo);

    // Menu item use-cases
    // Instantiate MenuItemRepository
    const menuItemRepo = new MenuItemRepository(pool);

    const createMenuItemUseCase = new CreateMenuItemUseCase(
      menuItemRepo,
      categoryRepo,
      limitsRepo,
      menuItemRepo,
      eventBus,
      txManager,
      pool
    );
    const getMenuItemUseCase = new GetMenuItemUseCase();
    const updateMenuItemUseCase = new UpdateMenuItemUseCase();
    const deleteMenuItemUseCase = new DeleteMenuItemUseCase();

    // Modifier use-cases
    const addModifierOptionUseCase = new AddModifierOptionUseCase();
    const attachModifierToItemUseCase = new AttachModifierToItemUseCase();
    const createModifierGroupUseCase = new CreateModifierGroupUseCase();
    const getMenuForBranchUseCase = new GetMenuForBranchUseCase();
    const linkMenuItemToStockUseCase = new LinkMenuItemToStockUseCase();
    const unlinkMenuItemFromStockUseCase = new UnlinkMenuItemFromStockUseCase();

    // Return the whole module API
    return {
      createCategoryUseCase,
      getAllCategoriesUseCase,
      updateCategoryUseCase,
      deleteCategoryUseCase,
      createMenuItemUseCase,
      getMenuItemUseCase,
      updateMenuItemUseCase,
      deleteMenuItemUseCase,
      addModifierOptionUseCase,
      attachModifierToItemUseCase,
      createModifierGroupUseCase,
      getMenuForBranchUseCase,
      linkMenuItemToStockUseCase,
      unlinkMenuItemFromStockUseCase,
    };
  }
}
