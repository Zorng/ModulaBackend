import { ModifierRepository } from "../../infra/repositories/modifier.js";
import { MenuItemRepository } from "../../infra/repositories/menuItem.js";
import { MenuItemModifierRepository } from "../../infra/repositories/menuItemModifier.js";
import { PolicyAdapter } from "../../infra/repositories/policyAdapter.js";
import { EventBusAdapter } from "../../infra/repositories/eventBus.js";
import { TransactionManager } from "../../../../platform/db/transactionManager.js";
import { pool } from "../../../../platform/db/index.js";
import type {
  IModifierRepository,
  IMenuItemRepository,
  IMenuItemModifierRepository,
  IPolicyPort,
  IEventBus,
  ITransactionManager,
} from "../../app/ports.js";
import {
  AddModifierOptionUseCase,
  AttachModifierToItemUseCase,
  CreateModifierGroupUseCase,
} from "../../app/use-cases/modifier/index.js";

export class ModifierFactory {
  static build() {
    const modifierRepo: IModifierRepository = new ModifierRepository(pool);
    const menuItemRepo: IMenuItemRepository = new MenuItemRepository(pool);
    const itemModifierRepo: IMenuItemModifierRepository =
      new MenuItemModifierRepository(pool);
    const policyPort: IPolicyPort = new PolicyAdapter(pool);
    const eventBus: IEventBus = new EventBusAdapter();
    const txManager: ITransactionManager = new TransactionManager();

    return {
      addModifierOptionUseCase: new AddModifierOptionUseCase(
        modifierRepo,
        policyPort,
        eventBus,
        txManager
      ),
      attachModifierToItemUseCase: new AttachModifierToItemUseCase(
        menuItemRepo,
        modifierRepo,
        itemModifierRepo,
        policyPort,
        eventBus,
        txManager
      ),
      createModifierGroupUseCase: new CreateModifierGroupUseCase(
        modifierRepo,
        policyPort,
        eventBus,
        txManager
      ),
    };
  }
}
