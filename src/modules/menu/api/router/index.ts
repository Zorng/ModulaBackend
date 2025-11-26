import { Router } from "express";
import { categoryRouter } from "./category.routes.js";
import { menuItemRouter } from "./menuItem.routes.js";
import { modifierRouter } from "./modifier.routes.js";
import { branchMenuRouter } from "./branchMenu.routes.js";
import { queryRouter } from "./query.routes.js";
import { stockIntegrationRouter } from "./stockIntegration.routes.js";

const menuRouter = Router();

menuRouter.use("/", categoryRouter);
menuRouter.use("/", menuItemRouter);
menuRouter.use("/", modifierRouter);
menuRouter.use("/", branchMenuRouter);
menuRouter.use("/", queryRouter);
menuRouter.use("/", stockIntegrationRouter);

export { menuRouter };
export default menuRouter;
