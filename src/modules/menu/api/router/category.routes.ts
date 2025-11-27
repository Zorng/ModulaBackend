// src/modules/menu/api/router/category.routes.ts
import { Router } from "express";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../../../platform/http/middleware/index.js";
import { authMiddleware } from "../../../auth/index.js";
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
 *     summary: Create a new menu category
 *     description: |
 *       Creates a new category for organizing menu items.
 *
 *       **Requirements:**
 *       - Name must be unique within the tenant
 *       - Respects tenant quota limits (max 8 categories by default)
 *
 *       **Example categories:** Coffee, Tea, Juice, Dessert
 *     tags:
 *       - Categories
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCategoryInput'
 *           examples:
 *             coffee:
 *               summary: Coffee category
 *               value:
 *                 name: "Coffee"
 *                 description: "Hot and cold coffee beverages"
 *                 displayOrder: 0
 *             tea:
 *               summary: Tea category
 *               value:
 *                 name: "Tea"
 *                 description: "Various tea selections"
 *                 displayOrder: 1
 *     responses:
 *       201:
 *         description: Category created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Category'
 *             example:
 *               id: "550e8400-e29b-41d4-a716-446655440000"
 *               name: "Coffee"
 *               description: "Hot and cold coffee beverages"
 *               displayOrder: 0
 *               isActive: true
 *               createdAt: "2025-01-15T10:30:00Z"
 *               updatedAt: "2025-01-15T10:30:00Z"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       409:
 *         $ref: '#/components/responses/ConflictError'
 */
categoryRouter.post(
  "/v1/menu/categories",
  (req, res, next) => authMiddleware.authenticate(req, res, next),
  validateBody(createCategorySchema),
  CategoryController.create
);

/**
 * @openapi
 * /v1/menu/categories:
 *   get:
 *     summary: List all categories
 *     description: |
 *       Retrieves all categories for the authenticated tenant, ordered by displayOrder.
 *
 *       **Filtering:**
 *       - Use `isActive=true` to show only active categories (default)
 *       - Use `isActive=false` to show deactivated categories
 *     tags:
 *       - Categories
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Filter by active status
 *         example: true
 *     responses:
 *       200:
 *         description: List of categories
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 categories:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Category'
 *                 total:
 *                   type: integer
 *                   description: Total number of categories
 *             example:
 *               categories:
 *                 - id: "550e8400-e29b-41d4-a716-446655440000"
 *                   name: "Coffee"
 *                   description: "Hot and cold coffee"
 *                   displayOrder: 0
 *                   isActive: true
 *                   createdAt: "2025-01-15T10:30:00Z"
 *                   updatedAt: "2025-01-15T10:30:00Z"
 *                 - id: "550e8400-e29b-41d4-a716-446655440001"
 *                   name: "Tea"
 *                   description: "Various teas"
 *                   displayOrder: 1
 *                   isActive: true
 *                   createdAt: "2025-01-15T10:31:00Z"
 *                   updatedAt: "2025-01-15T10:31:00Z"
 *               total: 2
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
categoryRouter.get(
  "/v1/menu/categories",
  (req, res, next) => authMiddleware.authenticate(req, res, next),
  validateQuery(listCategoriesQuerySchema),
  CategoryController.list
);

/**
 * @openapi
 * /v1/menu/categories/{categoryId}:
 *   get:
 *     summary: Get a specific category
 *     description: |
 *       Retrieves a single category by its ID.
 *
 *       **Note:** Only returns categories belonging to the authenticated tenant.
 *     tags:
 *       - Categories
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/categoryIdParam'
 *     responses:
 *       200:
 *         description: Category details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Category'
 *             example:
 *               id: "550e8400-e29b-41d4-a716-446655440000"
 *               name: "Coffee"
 *               description: "Hot and cold coffee beverages"
 *               displayOrder: 0
 *               isActive: true
 *               createdAt: "2025-01-15T10:30:00Z"
 *               updatedAt: "2025-01-15T10:30:00Z"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
categoryRouter.get(
  "/v1/menu/categories/:categoryId",
  (req, res, next) => authMiddleware.authenticate(req, res, next),
  validateParams(categoryIdParamSchema),
  CategoryController.get
);

/**
 * @openapi
 * /v1/menu/categories/{categoryId}:
 *   patch:
 *     summary: Update a category
 *     description: |
 *       Updates an existing category's name and/or display order.
 *
 *       **Updatable fields:**
 *       - `name`: Category name (must remain unique)
 *       - `displayOrder`: Sort order for POS display
 *
 *       **Note:** At least one field must be provided.
 *     tags:
 *       - Categories
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/categoryIdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateCategoryInput'
 *           examples:
 *             rename:
 *               summary: Rename category
 *               value:
 *                 name: "Hot Coffee"
 *             reorder:
 *               summary: Change display order
 *               value:
 *                 displayOrder: 5
 *             both:
 *               summary: Update both fields
 *               value:
 *                 name: "Premium Coffee"
 *                 displayOrder: 0
 *     responses:
 *       200:
 *         description: Category updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Category'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       409:
 *         $ref: '#/components/responses/ConflictError'
 */
categoryRouter.patch(
  "/v1/menu/categories/:categoryId",
  (req, res, next) => authMiddleware.authenticate(req, res, next),
  validateParams(categoryIdParamSchema),
  validateBody(updateCategorySchema),
  CategoryController.update
);

/**
 * @openapi
 * /v1/menu/categories/{categoryId}:
 *   delete:
 *     summary: Delete (deactivate) a category
 *     description: |
 *       Soft-deletes a category by setting `isActive = false`.
 *
 *       **Important:**
 *       - Cannot delete if category has active menu items
 *       - Move or delete all items first
 *       - Historical data remains intact
 *     tags:
 *       - Categories
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/categoryIdParam'
 *     responses:
 *       200:
 *         description: Category deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *             example:
 *               message: "Category deleted successfully"
 *       400:
 *         description: Cannot delete (has menu items)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Bad Request"
 *               message: "Cannot delete category 'Coffee' because it has 12 menu item(s). Please move or delete the items first."
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
categoryRouter.delete(
  "/v1/menu/categories/:categoryId",
  (req, res, next) => authMiddleware.authenticate(req, res, next),
  validateParams(categoryIdParamSchema),
  CategoryController.delete
);

export { categoryRouter };
