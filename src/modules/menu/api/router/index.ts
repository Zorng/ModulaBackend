import { Router } from "express";
import type { AuthMiddlewarePort } from "../../../../platform/security/auth.js";
import { createCategoryRouter } from "./category.routes.js";
import { createMenuItemRouter } from "./menuItem.routes.js";
import { createModifierRouter } from "./modifier.routes.js";
import { createBranchMenuRouter } from "./branchMenu.routes.js";
import { createQueryRouter } from "./query.routes.js";

export function createMenuRouter(authMiddleware: AuthMiddlewarePort) {
  const menuRouter = Router();

  menuRouter.use("/", createCategoryRouter(authMiddleware));
  menuRouter.use("/", createMenuItemRouter(authMiddleware));
  menuRouter.use("/", createModifierRouter(authMiddleware));
  menuRouter.use("/", createBranchMenuRouter(authMiddleware));
  menuRouter.use("/", createQueryRouter(authMiddleware));

  return menuRouter;
}
