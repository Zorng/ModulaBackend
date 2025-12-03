import { Router } from "express";
import {
  StockItemController,
  BranchStockController,
  InventoryJournalController,
  MenuStockMapController,
  CategoryController,
} from "./controller/index.js";
import { AuthMiddleware } from "../../auth/api/middleware/auth.middleware.js";
import { uploadOptionalSingleImage } from "../../../platform/http/middleware/multer.js";

export function createInventoryRoutes(
  stockItemController: StockItemController,
  branchStockController: BranchStockController,
  inventoryJournalController: InventoryJournalController,
  menuStockMapController: MenuStockMapController,
  categoryController: CategoryController,
  authMiddleware: AuthMiddleware
): Router {
  const router = Router();

  // Apply authentication to all inventory routes
  router.use(authMiddleware.authenticate);

  // ==================== STOCK ITEMS ====================

  /**
   * @openapi
   * /v1/inventory/stock-items:
   *   post:
   *     tags:
   *       - Inventory
   *     summary: Create a new stock item
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required:
   *               - name
   *               - unitText
   *             properties:
   *               name:
   *                 type: string
   *               unitText:
   *                 type: string
   *                 description: Unit of measure (e.g., pcs, kg, liter)
   *               barcode:
   *                 type: string
   *               pieceSize:
   *                 type: number
   *                 description: Size per piece/unit (e.g., weight, volume)
   *               isIngredient:
   *                 type: boolean
   *                 default: true
   *                 description: Can be used as ingredient in recipes
   *               isSellable:
   *                 type: boolean
   *                 default: false
   *                 description: Can be sold directly
   *               categoryId:
   *                 type: string
   *                 description: Optional category ID
   *               isActive:
   *                 type: boolean
   *                 default: true
   *               image:
   *                 type: string
   *                 format: binary
   *                 description: Image file (.jpg, .jpeg, .png, .webp)
   *     responses:
   *       201:
   *         description: Stock item created
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: string
   *                       format: uuid
   *                     tenantId:
   *                       type: string
   *                       format: uuid
   *                     name:
   *                       type: string
   *                     unitText:
   *                       type: string
   *                     barcode:
   *                       type: string
   *                       nullable: true
   *                     pieceSize:
   *                       type: number
   *                       nullable: true
   *                       description: Size per piece/unit
   *                     isIngredient:
   *                       type: boolean
   *                       description: Can be used as ingredient
   *                     isSellable:
   *                       type: boolean
   *                       description: Can be sold directly
   *                     categoryId:
   *                       type: string
   *                       nullable: true
   *                     imageUrl:
   *                       type: string
   *                       nullable: true
   *                       description: URL of the uploaded image
   *                     isActive:
   *                       type: boolean
   *                     createdBy:
   *                       type: string
   *                       format: uuid
   *                     createdAt:
   *                       type: string
   *                       format: date-time
   *                     updatedAt:
   *                       type: string
   *                       format: date-time
   */
  router.post(
    "/stock-items",
    uploadOptionalSingleImage,
    (req, res, next) => {
      // Coerce numeric fields if present
      if (req.body.pieceSize !== undefined) {
        req.body.pieceSize = Number(req.body.pieceSize);
      }
      if (req.body.isActive !== undefined) {
        req.body.isActive =
          req.body.isActive === "true" || req.body.isActive === true;
      }
      if (req.body.isIngredient !== undefined) {
        req.body.isIngredient =
          req.body.isIngredient === "true" || req.body.isIngredient === true;
      }
      if (req.body.isSellable !== undefined) {
        req.body.isSellable =
          req.body.isSellable === "true" || req.body.isSellable === true;
      }
      next();
    },
    async (req, res) => stockItemController.createStockItem(req as any, res)
  );

  /**
   * @openapi
   * /v1/inventory/stock-items/{id}:
   *   patch:
   *     tags:
   *       - Inventory
   *     summary: Update a stock item
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               unitText:
   *                 type: string
   *               barcode:
   *                 type: string
   *               pieceSize:
   *                 type: number
   *                 description: Size per piece/unit
   *               isIngredient:
   *                 type: boolean
   *                 description: Can be used as ingredient in recipes
   *               isSellable:
   *                 type: boolean
   *                 description: Can be sold directly
   *               categoryId:
   *                 type: string
   *                 description: Optional category ID
   *               isActive:
   *                 type: boolean
   *               image:
   *                 type: string
   *                 format: binary
   *                 description: Image file (.jpg, .jpeg, .png, .webp)
   *     responses:
   *       200:
   *         description: Stock item updated
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: string
   *                       format: uuid
   *                     tenantId:
   *                       type: string
   *                       format: uuid
   *                     name:
   *                       type: string
   *                     unitText:
   *                       type: string
   *                     barcode:
   *                       type: string
   *                       nullable: true
   *                     pieceSize:
   *                       type: number
   *                       nullable: true
   *                       description: Size per piece/unit
   *                     isIngredient:
   *                       type: boolean
   *                       description: Can be used as ingredient
   *                     isSellable:
   *                       type: boolean
   *                       description: Can be sold directly
   *                     categoryId:
   *                       type: string
   *                       nullable: true
   *                     imageUrl:
   *                       type: string
   *                       nullable: true
   *                       description: URL of the uploaded image
   *                     isActive:
   *                       type: boolean
   *                     createdBy:
   *                       type: string
   *                       format: uuid
   *                     createdAt:
   *                       type: string
   *                       format: date-time
   *                     updatedAt:
   *                       type: string
   *                       format: date-time
   */
  router.patch(
    "/stock-items/:id",
    uploadOptionalSingleImage,
    (req, res, next) => {
      // Coerce numeric fields if present
      if (req.body.pieceSize !== undefined) {
        req.body.pieceSize = Number(req.body.pieceSize);
      }
      if (req.body.isActive !== undefined) {
        req.body.isActive =
          req.body.isActive === "true" || req.body.isActive === true;
      }
      if (req.body.isIngredient !== undefined) {
        req.body.isIngredient =
          req.body.isIngredient === "true" || req.body.isIngredient === true;
      }
      if (req.body.isSellable !== undefined) {
        req.body.isSellable =
          req.body.isSellable === "true" || req.body.isSellable === true;
      }
      next();
    },
    async (req, res) => stockItemController.updateStockItem(req as any, res)
  );

  /**
   * @openapi
   * /v1/inventory/stock-items:
   *   get:
   *     tags:
   *       - Inventory
   *     summary: Get all stock items
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: query
   *         name: search
   *         schema:
   *           type: string
   *         description: Fuzzy search on name
   *       - in: query
   *         name: isActive
   *         schema:
   *           type: boolean
   *       - in: query
   *         name: categoryId
   *         schema:
   *           type: string
   *         description: Filter by category ID
   *       - in: query
   *         name: isIngredient
   *         schema:
   *           type: boolean
   *         description: Filter by ingredient flag
   *       - in: query
   *         name: isSellable
   *         schema:
   *           type: boolean
   *         description: Filter by sellable flag
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *       - in: query
   *         name: pageSize
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: List of stock items
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   type: object
   *                   properties:
   *                     items:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           id:
   *                             type: string
   *                             format: uuid
   *                           tenantId:
   *                             type: string
   *                             format: uuid
   *                           name:
   *                             type: string
   *                           unitText:
   *                             type: string
   *                           barcode:
   *                             type: string
   *                             nullable: true
   *                           pieceSize:
   *                             type: number
   *                             nullable: true
   *                             description: Size per piece/unit
   *                           isIngredient:
   *                             type: boolean
   *                             description: Can be used as ingredient
   *                           isSellable:
   *                             type: boolean
   *                             description: Can be sold directly
   *                           categoryId:
   *                             type: string
   *                             nullable: true
   *                           imageUrl:
   *                             type: string
   *                             nullable: true
   *                             description: URL of the uploaded image
   *                           isActive:
   *                             type: boolean
   *                           createdBy:
   *                             type: string
   *                             format: uuid
   *                           createdAt:
   *                             type: string
   *                             format: date-time
   *                           updatedAt:
   *                             type: string
   *                             format: date-time
   *                     total:
   *                       type: integer
   *                       description: Total number of items
   *                     page:
   *                       type: integer
   *                       description: Current page number
   *                     pageSize:
   *                       type: integer
   *                       description: Items per page
   */
  router.get("/stock-items", async (req, res) =>
    stockItemController.getStockItems(req as any, res)
  );

  // ==================== BRANCH STOCK ====================

  /**
   * @openapi
   * /v1/inventory/branch/stock-items:
   *   post:
   *     tags:
   *       - Inventory
   *     summary: Assign stock item to current branch
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - stockItemId
   *               - minThreshold
   *             properties:
   *               stockItemId:
   *                 type: string
   *                 format: uuid
   *               minThreshold:
   *                 type: number
   *                 minimum: 0
   *     responses:
   *       201:
   *         description: Stock item assigned to branch
   */
  router.post("/branch/stock-items", async (req, res) =>
    branchStockController.assignStockItemToBranch(req as any, res)
  );

  /**
   * @openapi
   * /v1/inventory/branch/stock-items:
   *   get:
   *     tags:
   *       - Inventory
   *     summary: Get all stock items for current branch
   *     security:
   *       - BearerAuth: []
   *     responses:
   *       200:
   *         description: List of branch stock items with details
   */
  router.get("/branch/stock-items", async (req, res) =>
    branchStockController.getBranchStockItems(req as any, res)
  );

  // ==================== INVENTORY JOURNAL OPERATIONS ====================

  /**
   * @openapi
   * /v1/inventory/journal/receive:
   *   post:
   *     tags:
   *       - Inventory
   *     summary: Record stock receipt
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - stockItemId
   *               - qty
   *             properties:
   *               stockItemId:
   *                 type: string
   *                 format: uuid
   *               qty:
   *                 type: number
   *                 minimum: 0.001
   *               note:
   *                 type: string
   *     responses:
   *       201:
   *         description: Stock received
   */
  router.post("/journal/receive", async (req, res) =>
    inventoryJournalController.receiveStock(req as any, res)
  );

  /**
   * @openapi
   * /v1/inventory/journal/waste:
   *   post:
   *     tags:
   *       - Inventory
   *     summary: Record stock waste/spoilage
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - stockItemId
   *               - qty
   *               - note
   *             properties:
   *               stockItemId:
   *                 type: string
   *                 format: uuid
   *               qty:
   *                 type: number
   *                 minimum: 0.001
   *               note:
   *                 type: string
   *                 description: Mandatory for waste entries
   *     responses:
   *       201:
   *         description: Stock waste recorded
   */
  router.post("/journal/waste", async (req, res) =>
    inventoryJournalController.wasteStock(req as any, res)
  );

  /**
   * @openapi
   * /v1/inventory/journal/correct:
   *   post:
   *     tags:
   *       - Inventory
   *     summary: Record manual stock correction
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - stockItemId
   *               - delta
   *               - note
   *             properties:
   *               stockItemId:
   *                 type: string
   *                 format: uuid
   *               delta:
   *                 type: number
   *                 description: Positive or negative adjustment (cannot be zero)
   *               note:
   *                 type: string
   *                 description: Mandatory for correction entries
   *     responses:
   *       201:
   *         description: Stock correction recorded
   */
  router.post("/journal/correct", async (req, res) =>
    inventoryJournalController.correctStock(req as any, res)
  );

  /**
   * @openapi
   * /_internal/inventory/journal/sale:
   *   post:
   *     tags:
   *       - Inventory (Internal)
   *     summary: Record sale deductions (internal only)
   *     description: Called by sales module when sale is finalized
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - refSaleId
   *               - lines
   *             properties:
   *               refSaleId:
   *                 type: string
   *                 format: uuid
   *               lines:
   *                 type: array
   *                 items:
   *                   type: object
   *                   required:
   *                     - stockItemId
   *                     - qtyDeducted
   *                   properties:
   *                     stockItemId:
   *                       type: string
   *                       format: uuid
   *                     qtyDeducted:
   *                       type: number
   *     responses:
   *       201:
   *         description: Sale deductions recorded
   */
  router.post("/_internal/journal/sale", async (req, res) =>
    inventoryJournalController.recordSaleDeductions(req as any, res)
  );

  /**
   * @openapi
   * /_internal/inventory/journal/void:
   *   post:
   *     tags:
   *       - Inventory (Internal)
   *     summary: Record void reversals (internal only)
   *     description: Called by sales module when sale is voided
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - refSaleId
   *               - originalLines
   *             properties:
   *               refSaleId:
   *                 type: string
   *                 format: uuid
   *               originalLines:
   *                 type: array
   *                 items:
   *                   type: object
   *     responses:
   *       201:
   *         description: Void reversals recorded
   */
  router.post("/_internal/journal/void", async (req, res) =>
    inventoryJournalController.recordVoid(req as any, res)
  );

  /**
   * @openapi
   * /_internal/inventory/journal/reopen:
   *   post:
   *     tags:
   *       - Inventory (Internal)
   *     summary: Record reopen redeductions (internal only)
   *     description: Called by sales module when sale is reopened
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - originalSaleId
   *               - newSaleId
   *               - lines
   *             properties:
   *               originalSaleId:
   *                 type: string
   *                 format: uuid
   *               newSaleId:
   *                 type: string
   *                 format: uuid
   *               lines:
   *                 type: array
   *                 items:
   *                   type: object
   *     responses:
   *       201:
   *         description: Reopen redeductions recorded
   */
  router.post("/_internal/journal/reopen", async (req, res) =>
    inventoryJournalController.recordReopen(req as any, res)
  );

  /**
   * @openapi
   * /v1/inventory/branch/on-hand:
   *   get:
   *     tags:
   *       - Inventory
   *     summary: Get on-hand quantities for current branch
   *     security:
   *       - BearerAuth: []
   *     responses:
   *       200:
   *         description: On-hand quantities with low stock flags
   */
  router.get("/branch/on-hand", async (req, res) =>
    inventoryJournalController.getOnHand(req as any, res)
  );

  /**
   * @openapi
   * /v1/inventory/branch/journal:
   *   get:
   *     tags:
   *       - Inventory
   *     summary: Get inventory journal entries
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: query
   *         name: stockItemId
   *         schema:
   *           type: string
   *           format: uuid
   *       - in: query
   *         name: reason
   *         schema:
   *           type: string
   *           enum: [receive, sale, waste, correction, void, reopen]
   *       - in: query
   *         name: fromDate
   *         schema:
   *           type: string
   *           format: date-time
   *       - in: query
   *         name: toDate
   *         schema:
   *           type: string
   *           format: date-time
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *       - in: query
   *         name: pageSize
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Journal entries with pagination
   */
  router.get("/branch/journal", async (req, res) =>
    inventoryJournalController.getInventoryJournal(req as any, res)
  );

  /**
   * @openapi
   * /v1/inventory/branch/alerts/low-stock:
   *   get:
   *     tags:
   *       - Inventory
   *     summary: Get low stock alerts
   *     security:
   *       - BearerAuth: []
   *     responses:
   *       200:
   *         description: Items below minimum threshold
   */
  router.get("/branch/alerts/low-stock", async (req, res) =>
    inventoryJournalController.getLowStockAlerts(req as any, res)
  );

  /**
   * @openapi
   * /v1/inventory/branch/alerts/exceptions:
   *   get:
   *     tags:
   *       - Inventory
   *     summary: Get inventory exceptions
   *     security:
   *       - BearerAuth: []
   *     responses:
   *       200:
   *         description: Negative stock items and unmapped sales
   */
  router.get("/branch/alerts/exceptions", async (req, res) =>
    inventoryJournalController.getInventoryExceptions(req as any, res)
  );

  // ==================== MENU STOCK MAP ====================

  /**
   * @openapi
   * /v1/inventory/menu-stock-map:
   *   post:
   *     tags:
   *       - Inventory
   *     summary: Set menu item to stock item mapping
   *     description: Create or update mapping (supports multiple stock items per menu item)
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - menuItemId
   *               - stockItemId
   *               - qtyPerSale
   *             properties:
   *               menuItemId:
   *                 type: string
   *                 format: uuid
   *               stockItemId:
   *                 type: string
   *                 format: uuid
   *               qtyPerSale:
   *                 type: number
   *                 minimum: 0.001
   *                 description: Quantity deducted per sale (positive value)
   *     responses:
   *       201:
   *         description: Mapping created/updated
   */
  router.post("/menu-stock-map", async (req, res) =>
    menuStockMapController.setMenuStockMap(req as any, res)
  );

  /**
   * @openapi
   * /v1/inventory/menu-stock-map/{menuItemId}:
   *   get:
   *     tags:
   *       - Inventory
   *     summary: Get all stock mappings for a menu item
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: menuItemId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Array of stock item mappings
   */
  router.get("/menu-stock-map/:menuItemId", async (req, res) =>
    menuStockMapController.getMenuStockMap(req as any, res)
  );

  /**
   * @openapi
   * /v1/inventory/menu-stock-map:
   *   get:
   *     tags:
   *       - Inventory
   *     summary: Get all menu stock mappings
   *     security:
   *       - BearerAuth: []
   *     responses:
   *       200:
   *         description: All mappings
   */
  router.get("/menu-stock-map", async (req, res) =>
    menuStockMapController.getAllMenuStockMaps(req as any, res)
  );

  /**
   * @openapi
   * /v1/inventory/menu-stock-map/{id}:
   *   delete:
   *     tags:
   *       - Inventory
   *     summary: Delete a specific mapping
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       204:
   *         description: Mapping deleted
   */
  router.delete("/menu-stock-map/:id", async (req, res) =>
    menuStockMapController.deleteMenuStockMap(req as any, res)
  );

  // ==================== CATEGORIES ====================

  /**
   * @openapi
   * /v1/inventory/categories:
   *   get:
   *     tags:
   *       - Inventory
   *     summary: Get all categories
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: query
   *         name: isActive
   *         schema:
   *           type: boolean
   *     responses:
   *       200:
   *         description: List of categories
   */
  router.get("/categories", async (req, res) =>
    categoryController.getCategories(req as any, res)
  );

  /**
   * @openapi
   * /v1/inventory/categories:
   *   post:
   *     tags:
   *       - Inventory
   *     summary: Create a new category
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - name
   *             properties:
   *               name:
   *                 type: string
   *                 minLength: 2
   *                 maxLength: 40
   *               displayOrder:
   *                 type: integer
   *                 default: 0
   *               isActive:
   *                 type: boolean
   *                 default: true
   *     responses:
   *       201:
   *         description: Category created
   */
  router.post("/categories", async (req, res) =>
    categoryController.createCategory(req as any, res)
  );

  /**
   * @openapi
   * /v1/inventory/categories/{id}:
   *   patch:
   *     tags:
   *       - Inventory
   *     summary: Update a category
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               displayOrder:
   *                 type: integer
   *               isActive:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Category updated
   */
  router.patch("/categories/:id", async (req, res) =>
    categoryController.updateCategory(req as any, res)
  );

  /**
   * @openapi
   * /v1/inventory/categories/{id}:
   *   delete:
   *     tags:
   *       - Inventory
   *     summary: Delete a category
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: safeMode
   *         schema:
   *           type: boolean
   *         description: If true, nullify category_id on items instead of blocking
   *     responses:
   *       204:
   *         description: Category deleted
   */
  router.delete("/categories/:id", async (req, res) =>
    categoryController.deleteCategory(req as any, res)
  );

  return router;
}

export type InventoryRouter = Router;
