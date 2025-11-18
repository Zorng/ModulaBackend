import { BranchMenuRepository } from "../../infra/repositories/branchMenu.js";
import { MenuItemRepository } from "../../infra/repositories/menuItem.js";
import { PolicyAdapter } from "../../infra/repositories/policyAdapter.js";
import { EventBusAdapter } from "../../infra/repositories/eventBus.js";
import { pool } from "../../../../platform/db/index.js";
import type {
  IBranchMenuRepository,
  IMenuItemRepository,
  IPolicyPort,
  IEventBus,
  ITransactionManager
} from "../../app/ports.js";
import {
  SetBranchAvailabilityUseCase,
  SetBranchPriceOverrideUseCase,
} from "../../app/use-cases/branch-menu/index.js";
import { TransactionManager } from "../../../../platform/db/transactionManager.js";

export class BranchMenuFactory {
  static build() {
    const branchMenuRepo: IBranchMenuRepository = new BranchMenuRepository(
      pool
    );
    const menuItemRepo: IMenuItemRepository = new MenuItemRepository(pool);
    const policyPort: IPolicyPort = new PolicyAdapter(pool);
    const eventBus: IEventBus = new EventBusAdapter();
    const txManager: ITransactionManager = new TransactionManager()

    return {
      setBranchAvailabilityUseCase: new SetBranchAvailabilityUseCase(
        branchMenuRepo,
        menuItemRepo,
        policyPort,
        eventBus,
        txManager
      ),
      setBranchPriceOverrideUseCase: new SetBranchPriceOverrideUseCase(
        branchMenuRepo,
        menuItemRepo,
        policyPort,
        txManager
      ),
    };
  }
}
