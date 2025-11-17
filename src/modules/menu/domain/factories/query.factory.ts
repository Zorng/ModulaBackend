import { CategoryRepository } from "../../infra/repositories/category.js";
import { MenuItemRepository } from "../../infra/repositories/menuItem.js";
import { BranchMenuRepository } from "../../infra/repositories/branchMenu.js";
import { ModifierRepository } from "../../infra/repositories/modifier.js";
import { MenuItemModifierRepository } from "../../infra/repositories/menuItemModifier.js";
import { pool } from "../../../../platform/db/index.js";
import type {
  ICategoryRepository,
  IMenuItemRepository,
  IBranchMenuRepository,
  IModifierRepository,
  IMenuItemModifierRepository,
} from "../../app/ports.js";
import { GetMenuForBranchUseCase } from "../../app/use-cases/query/index.js";

export class QueryFactory {
  static build() {
    const categoryRepo: ICategoryRepository = new CategoryRepository(pool);
    const menuItemRepo: IMenuItemRepository = new MenuItemRepository(pool);
    const branchMenuRepo: IBranchMenuRepository = new BranchMenuRepository(
      pool
    );
    const modifierRepo: IModifierRepository = new ModifierRepository(pool);
    const itemModifierRepo: IMenuItemModifierRepository =
      new MenuItemModifierRepository(pool);

    return {
      getMenuForBranchUseCase: new GetMenuForBranchUseCase(
        categoryRepo,
        menuItemRepo,
        branchMenuRepo,
        modifierRepo,
        itemModifierRepo
      ),
    };
  }
}
