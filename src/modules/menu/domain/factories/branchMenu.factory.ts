import { BranchMenuRepository } from "../../infra/repositories/branchMenu.js";
import { MenuItemRepository } from "../../infra/repositories/menuItem.js";
import { PolicyRepository } from "../../infra/repositories/policyAdapter.js";
import { EventBusAdapter } from "../../infra/repositories/eventBus.js";
import { pool } from "../../../../platform/db/index.js";
import type {
  IBranchMenuRepository,
  IMenuItemRepository,
  IPolicyPort,
  IEventBus,
} from "../../app/ports.js";
import {
  SetBranchAvailabilityUseCase,
  SetBranchPriceOverrideUseCase,
} from "../../app/use-cases/branch-menu/index.js";

export class BranchMenuFactory {
  static build() {
    const branchMenuRepo: IBranchMenuRepository = new BranchMenuRepository(
      pool
    );
    const menuItemRepo: IMenuItemRepository = new MenuItemRepository(pool);
    const policyPort: IPolicyPort = new PolicyRepository(pool);
    const eventBus: IEventBus = new EventBusAdapter();

    return {
      setBranchAvailabilityUseCase: new SetBranchAvailabilityUseCase(
        branchMenuRepo,
        menuItemRepo,
        policyPort,
        eventBus
      ),
      setBranchPriceOverrideUseCase: new SetBranchPriceOverrideUseCase(
        branchMenuRepo,
        menuItemRepo,
        policyPort
      ),
    };
  }
}
