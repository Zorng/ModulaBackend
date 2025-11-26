import { ModifierRepository } from "../../infra/repositories/modifier.js";
import { MenuItemRepository } from "../../infra/repositories/menuItem.js";
import { MenuItemModifierRepository } from "../../infra/repositories/menuItemModifier.js";
import { PolicyAdapter } from "../../infra/repositories/policyAdapter.js";
import { EventBusAdapter } from "../../infra/repositories/eventBus.js";
import { TransactionManager } from "../../../../platform/db/transactionManager.js";
import { TenantLimitsRepository } from "../../infra/repositories/tenantLimits.js";
import { pool } from "../../../../platform/db/index.js";
import type {
  IModifierRepository,
  IMenuItemRepository,
  IMenuItemModifierRepository,
  IPolicyPort,
  IEventBus,
  ITransactionManager,
  ITenantLimitsRepository,
} from "../../app/ports.js";
import {
  AddModifierOptionUseCase,
  AttachModifierToItemUseCase,
  DetachModifierFromItemUseCase,
  CreateModifierGroupUseCase,
  UpdateModifierGroupUseCase,
  UpdateModifierOptionUseCase,
  GetModifierGroupUseCase,
  ListModifierGroupUseCase,
  ListModifierOptionUseCase,
  ListModifierOptionsForGroupUseCase,
  DeleteModifierGroupUseCase,
  DeleteModifierOptionUseCase,
  HardDeleteModifierGroupUseCase,
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
    const tenantLimitsRepo: ITenantLimitsRepository =
      new TenantLimitsRepository(pool);

    return {
      addModifierOptionUseCase: new AddModifierOptionUseCase(
        modifierRepo,
        tenantLimitsRepo,
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
        txManager,
        tenantLimitsRepo
      ),
      detachModifierFromItemUseCase: new DetachModifierFromItemUseCase(
        menuItemRepo,
        modifierRepo,
        itemModifierRepo,
        policyPort,
        txManager
      ),
      createModifierGroupUseCase: new CreateModifierGroupUseCase(
        modifierRepo,
        policyPort,
        eventBus,
        txManager
      ),
      updateModifierGroupUseCase: new UpdateModifierGroupUseCase(
        modifierRepo,
        policyPort,
        eventBus,
        txManager
      ),
      updateModifierOptionUseCase: new UpdateModifierOptionUseCase(
        modifierRepo,
        policyPort,
        eventBus,
        txManager
      ),
      getModifierGroupUseCase: new GetModifierGroupUseCase(modifierRepo),
      listModifierGroupUseCase: new ListModifierGroupUseCase(modifierRepo),
      listModifierOptionUseCase: new ListModifierOptionUseCase(modifierRepo),
      listModifierOptionsForGroupUseCase:
        new ListModifierOptionsForGroupUseCase(modifierRepo),
      deleteModifierGroupUseCase: new DeleteModifierGroupUseCase(
        modifierRepo,
        itemModifierRepo,
        policyPort,
        txManager,
        eventBus
      ),
      hardDeleteModifierGroupUseCase: new HardDeleteModifierGroupUseCase(
        modifierRepo,
        itemModifierRepo,
        policyPort,
        txManager,
        eventBus
      ),
      deleteModifierOptionUseCase: new DeleteModifierOptionUseCase(
        modifierRepo,
        policyPort,
        txManager,
        eventBus
      ),
    };
  }
}
