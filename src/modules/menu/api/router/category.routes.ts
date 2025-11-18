import { Router } from "express";
import {
  authenticate,
  validateBody,
  validateParams,
  validateQuery,
} from "../../../../platform/http/middleware/index.js";
import { CategoryController } from "../controller/index.js";
import {
  createCategorySchema,
  updateCategorySchema,
  categoryIdParamSchema,
  listCategoriesQuerySchema,
} from "../schemas/schemas.js";

const categoryRouter = Router();

// POST /v1/menu/categories
categoryRouter.post(
  "/v1/menu/categories",
  authenticate,
  validateBody(createCategorySchema),
  CategoryController.create
);

// GET /v1/menu/categories
categoryRouter.get(
  "/v1/menu/categories",
  authenticate,
  validateQuery(listCategoriesQuerySchema),
  CategoryController.list
);

// PATCH /v1/menu/categories/:categoryId
categoryRouter.patch(
  "/v1/menu/categories/:categoryId",
  authenticate,
  validateParams(categoryIdParamSchema),
  validateBody(updateCategorySchema),
  CategoryController.update
);

// DELETE /v1/menu/categories/:categoryId
categoryRouter.delete(
  "/v1/menu/categories/:categoryId",
  authenticate,
  validateParams(categoryIdParamSchema),
  CategoryController.delete
);

export { categoryRouter };
