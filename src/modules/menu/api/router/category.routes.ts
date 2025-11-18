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

/**
 * @openapi
 * /v1/menu/categories:
 *   post:
 *     summary: Create a new category
 *     tags:
 *       - Categories
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCategoryInput'
 *     responses:
 *       201:
 *         description: Category created
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
categoryRouter.post(
  "/v1/menu/categories",
  authenticate,
  validateBody(createCategorySchema),
  CategoryController.create
);

/**
 * @openapi
 * /v1/menu/categories:
 *   get:
 *     summary: List all categories
 *     tags:
 *       - Categories
 *     parameters:
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *         required: false
 *         description: Tenant ID to filter categories
 *     responses:
 *       200:
 *         description: List of categories
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Category'
 *       401:
 *         description: Unauthorized
 */
categoryRouter.get(
  "/v1/menu/categories",
  authenticate,
  validateQuery(listCategoriesQuerySchema),
  CategoryController.list
);

/**
 * @openapi
 * /v1/menu/categories/{categoryId}:
 *   patch:
 *     summary: Update a category
 *     tags:
 *       - Categories
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *         description: Category ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateCategoryInput'
 *     responses:
 *       200:
 *         description: Category updated
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Category not found
 */
categoryRouter.patch(
  "/v1/menu/categories/:categoryId",
  authenticate,
  validateParams(categoryIdParamSchema),
  validateBody(updateCategorySchema),
  CategoryController.update
);

/**
 * @openapi
 * /v1/menu/categories/{categoryId}:
 *   delete:
 *     summary: Delete a category
 *     tags:
 *       - Categories
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *         description: Category ID
 *     responses:
 *       204:
 *         description: Category deleted
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Category not found
 */
categoryRouter.delete(
  "/v1/menu/categories/:categoryId",
  authenticate,
  validateParams(categoryIdParamSchema),
  CategoryController.delete
);

export { categoryRouter };
