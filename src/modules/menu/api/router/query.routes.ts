import { Router } from "express";
import {
  authenticate,
  validateQuery,
} from "../../../../platform/http/middleware/index.js";
import { QueryController } from "../controller/index.js";
import { branchIdQuerySchema } from "../schemas/schemas.js";

const queryRouter = Router();

// GET /v1/menu/snapshot
queryRouter.get(
  "/v1/menu/snapshot",
  authenticate,
  validateQuery(branchIdQuerySchema),
  QueryController.getMenuSnapshot
);

export { queryRouter };
