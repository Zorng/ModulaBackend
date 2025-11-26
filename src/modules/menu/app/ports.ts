import type {
  Category,
  MenuItem,
  ModifierGroup,
  ModifierOption,
  MenuStockMap,
  TenantLimits,
} from "../domain/entities.js";
import type { PoolClient } from "pg";
import type { DomainEvent } from "../../../shared/events.js";

// ============================================================================
// REPOSITORY PORTS (Data Access Layer)
// ============================================================================

export interface ICategoryRepository {
  /**
   * Save a category (insert or update based on existence)
   */
  save(category: Category, client?: PoolClient): Promise<void>;

  /**
   * Find category by ID
   * @returns Category entity or null if not found
   */
  findById(
    id: string,
    tenantId: string,
    client?: PoolClient
  ): Promise<Category | null>;

  /**
   * Find all categories for a tenant (ordered by displayOrder ASC)
   */
  findByTenantId(tenantId: string, client?: PoolClient): Promise<Category[]>;

  /**
   * Count active categories for a tenant (for quota enforcement)
   */
  countByTenantId(tenantId: string, client?: PoolClient): Promise<number>;

  /**
   * Delete a category (soft delete by setting isActive=false)
   */
  delete(id: string, tenantId: string, client?: PoolClient): Promise<void>;

  /**
   * Check if category name exists for a tenant
   * @param excludeId - Optional category ID to exclude from check (for updates)
   */
  existsByName(
    name: string,
    tenantId: string,
    excludeId?: string,
    client?: PoolClient
  ): Promise<boolean>;
}

export interface IMenuItemRepository {
  /**
   * Save a menu item (insert or update)
   */
  save(item: MenuItem, client?: PoolClient): Promise<void>;

  /**
   * Find menu item by ID
   */
  findById(
    id: string,
    tenantId: string,
    client?: PoolClient
  ): Promise<MenuItem | null>;

  /**
   * Find all items in a category
   */
  findByCategoryId(
    categoryId: string,
    tenantId: string,
    client?: PoolClient
  ): Promise<MenuItem[]>;

  /**
   * Find all items for a tenant
   */
  findByTenantId(tenantId: string, client?: PoolClient): Promise<MenuItem[]>;

  /**
   * Count active items for quota enforcement
   */
  countByTenantId(tenantId: string, client?: PoolClient): Promise<number>;

  /**
   * Delete a menu item (soft delete)
   */
  delete(id: string, tenantId: string, client?: PoolClient): Promise<void>;

  /**
   * Check if item name exists in a category
   * @param excludeId - Optional item ID to exclude (for updates)
   */
  existsByNameInCategory(
    name: string,
    categoryId: string,
    tenantId: string,
    excludeId?: string,
    client?: PoolClient
  ): Promise<boolean>;
}

export interface IModifierRepository {
  /**
   * Save a modifier group (insert or update)
   */
  saveGroup(group: ModifierGroup, client?: PoolClient): Promise<void>;

  /**
   * Save a modifier option (insert or update)
   */
  saveOption(option: ModifierOption, client?: PoolClient): Promise<void>;

  /**
   * Find modifier group by ID
   */
  findGroupById(
    id: string,
    tenantId: string,
    client?: PoolClient
  ): Promise<ModifierGroup | null>;

  /**
   * Find modifier option by ID
   */
  findOptionById(
    id: string,
    tenantId: string,
    client?: PoolClient
  ): Promise<ModifierOption | null>;

  /**
   * Find all options in a modifier group
   */
  findOptionsByGroupId(
    groupId: string,
    tenantId: string,
    client?: PoolClient
  ): Promise<ModifierOption[]>;

  /**
   * Find all modifier groups for a tenant
   */
  findGroupsByTenantId(
    tenantId: string,
    client?: PoolClient
  ): Promise<ModifierGroup[]>;

  /**
   * Delete a modifier group (should cascade delete options)
   */
  deleteGroup(id: string, tenantId: string, client?: PoolClient): Promise<void>;

  /**
   * Delete a modifier option
   */
  deleteOption(
    id: string,
    tenantId: string,
    client?: PoolClient
  ): Promise<void>;
}

export interface IMenuItemModifierRepository {
  /**
   * Attach a modifier group to a menu item
   * @param isRequired - Whether the modifier must be selected
   */
  attach(
    menuItemId: string,
    modifierGroupId: string,
    tenantId: string,
    isRequired: boolean,
    client?: PoolClient
  ): Promise<void>;

  /**
   * Detach a modifier group from a menu item
   */
  detach(
    menuItemId: string,
    modifierGroupId: string,
    tenantId: string,
    client?: PoolClient
  ): Promise<void>;

  /**
   * Find all modifier groups attached to a menu item
   * @returns Array of groups with their isRequired flag
   */
  findByMenuItemId(
    menuItemId: string,
    tenantId: string,
    client?: PoolClient
  ): Promise<Array<{ group: ModifierGroup; isRequired: boolean }>>;

  /**
   * Check if a modifier group is already attached to a menu item
   */
  isAttached(
    menuItemId: string,
    modifierGroupId: string,
    tenantId: string,
    client?: PoolClient
  ): Promise<boolean>;
}

export interface IBranchMenuRepository {
  /**
   * Set branch-specific availability for a menu item
   */
  setAvailability(
    menuItemId: string,
    branchId: string,
    tenantId: string,
    isAvailable: boolean,
    client?: PoolClient
  ): Promise<void>;

  /**
   * Set branch-specific price override
   */
  setPriceOverride(
    menuItemId: string,
    branchId: string,
    tenantId: string,
    priceUsd: number,
    client?: PoolClient
  ): Promise<void>;

  /**
   * Get branch-specific overrides for a menu item
   */
  findByMenuItemId(
    menuItemId: string,
    tenantId: string,
    client?: PoolClient
  ): Promise<
    Array<{
      branchId: string;
      isAvailable: boolean;
      priceOverrideUsd: number | null;
    }>
  >;

  /**
   * Get all available menu items for a specific branch
   * (applies branch overrides to filter)
   */
  findAvailableByBranchId(
    branchId: string,
    tenantId: string,
    client?: PoolClient
  ): Promise<MenuItem[]>;

  /**
   * Remove branch override (revert to default)
   */
  removeOverride(
    menuItemId: string,
    branchId: string,
    tenantId: string,
    client?: PoolClient
  ): Promise<void>;
}

export interface IMenuStockMapRepository {
  /**
   * Save a menu-stock mapping
   */
  save(mapping: MenuStockMap, client?: PoolClient): Promise<void>;

  /**
   * Find all stock mappings for a menu item
   */
  findByMenuItemId(
    menuItemId: string,
    tenantId: string,
    client?: PoolClient
  ): Promise<MenuStockMap[]>;

  /**
   * Find all menu items using a stock item
   */
  findByStockItemId(
    stockItemId: string,
    tenantId: string,
    client?: PoolClient
  ): Promise<MenuStockMap[]>;

  /**
   * Delete a mapping
   */
  delete(id: string, tenantId: string, client?: PoolClient): Promise<void>;

  /**
   * Check if a specific mapping exists
   */
  exists(
    menuItemId: string,
    stockItemId: string,
    tenantId: string,
    client?: PoolClient
  ): Promise<boolean>;
}

export interface ITenantLimitsRepository {
  /**
   * Get tenant limits by tenant ID
   */
  findByTenantId(
    tenantId: string,
    client?: PoolClient
  ): Promise<TenantLimits | null>;

  /**
   * Save tenant limits (insert or update)
   */
  save(limits: TenantLimits, client?: PoolClient): Promise<void>;

  /**
   * Create default limits for a new tenant
   * (Called when tenant is first created)
   */
  createDefault(tenantId: string, client?: PoolClient): Promise<TenantLimits>;
}

// ============================================================================
// EXTERNAL SERVICE PORTS (Cross-Module Communication)
// ============================================================================

export interface IPolicyPort {
  /**
   * Check if user can create/update categories
   */
  canCreateCategory(tenantId: string, userId: string): Promise<boolean>;

  /**
   * Check if user can edit menu items
   */
  canEditMenuItem(tenantId: string, userId: string): Promise<boolean>;

  /**
   * Check if user can manage modifiers
   */
  canManageModifiers(tenantId: string, userId: string): Promise<boolean>;

  /**
   * Check if user can manage branch-specific menu settings
   */
  canManageBranchMenu(
    tenantId: string,
    userId: string,
    branchId: string
  ): Promise<boolean>;
}

/**
 * Inventory Service Port
 * Validates stock item existence before linking
 * (Implemented by the Inventory module)
 *
 * IMPLEMENTATION HINTS:
 * - Create adapter that queries Inventory module's database/API
 * - stockItemExists() -> SELECT COUNT(*) FROM inventory_stock_items WHERE id = $1
 * - getStockItem() -> SELECT * FROM inventory_stock_items WHERE id = $1
 * - Use event-driven approach: Menu module listens to "stock_item_created" events
 * - For development: Stub with hardcoded data or skip validation
 */
export interface IInventoryPort {
  /**
   * Check if stock item exists
   */
  stockItemExists(stockItemId: string, tenantId: string): Promise<boolean>;

  /**
   * Get stock item details (for validation/display)
   */
  getStockItem(
    stockItemId: string,
    tenantId: string
  ): Promise<{
    id: string;
    name: string;
    unit: string;
    currentQty: number;
  } | null>;
}

/**
 * Image Storage Port
 * Uploads and manages menu item images
 * (Could be implemented with S3, Cloudinary, local storage, etc.)
 *
 * IMPLEMENTATION HINTS:
 * - Option 1 (S3): Use @aws-sdk/client-s3, upload to S3 bucket, return URL
 * - Option 2 (Cloudinary): Use cloudinary package, upload.upload_stream()
 * - Option 3 (Local): Save to /public/uploads, return /uploads/filename
 * - isValidImageUrl() -> Check regex: /^https?:\/\/.+\.(jpg|jpeg|png|webp)$/i
 * - deleteImage() -> Extract key from URL, call S3.deleteObject() or fs.unlink()
 * - Add file size validation (e.g., max 5MB)
 */
export interface IImageStoragePort {
  /**
   * Upload image and return public URL
   * @param file - Image file buffer
   * @param filename - Original filename
   * @returns Public URL to access the image
   */
  uploadImage(
    file: Buffer,
    filename: string,
    tenantId: string
  ): Promise<string>;

  /**
   * Delete image by URL
   */
  deleteImage(imageUrl: string, tenantId: string): Promise<void>;

  /**
   * Validate image URL format
   * (e.g., check if it's a valid HTTP(S) URL or matches expected pattern)
   */
  isValidImageUrl(url: string): boolean;
}

// ============================================================================
// EVENT BUS PORT (Domain Event Publishing)
// ============================================================================

/**
 * Event Bus Port
 * Publishes domain events for inter-module communication
 * (Implemented by the platform event bus)
 *
 * IMPLEMENTATION HINTS:
 * - Use existing platform/events/index.ts event bus
 * - publish() -> Call eventBus.emit(event.type, event.payload)
 * - publishViaOutbox() -> Call publishToOutbox() from platform/events/outbox.ts
 * - Outbox ensures reliable delivery (transactional)
 * - Events are async, non-blocking
 * - Example: eventBus.emit('menu.category_created.v1', { categoryId, ... })
 */
export interface IEventBus {
  /**
   * Publish a domain event (async, non-blocking)
   * For non-critical events that don't need guaranteed delivery
   */
  publish<T extends DomainEvent>(event: T): Promise<void>;

  /**
   * Publish event via transactional outbox (reliable delivery)
   * Use this for critical events that must be delivered
   * @param client - Database transaction client
   */
  publishViaOutbox<T extends DomainEvent>(event: T, client: any): Promise<void>;
}

// ============================================================================
// TRANSACTION PORT (Unit of Work Pattern)
// ============================================================================

/**
 * Transaction Manager Port
 * Manages database transactions for atomic operations
 * (Implemented by the platform database module)
 *
 * IMPLEMENTATION HINTS:
 * - Use pg.Pool.connect() to get client
 * - Wrap operations in BEGIN/COMMIT/ROLLBACK
 * - Example implementation:
 *   async withTransaction(callback) {
 *     const client = await pool.connect();
 *     try {
 *       await client.query('BEGIN');
 *       const result = await callback(client);
 *       await client.query('COMMIT');
 *       return result;
 *     } catch (err) {
 *       await client.query('ROLLBACK');
 *       throw err;
 *     } finally {
 *       client.release();
 *     }
 *   }
 */
export interface ITransactionManager {
  /**
   * Execute operations within a transaction
   * Automatically commits on success, rolls back on error
   *
   * @example
   * await txManager.withTransaction(async (client) => {
   *   await repo1.save(entity1, client);
   *   await repo2.save(entity2, client);
   *   await eventBus.publishViaOutbox(event, client);
   * });
   */
  withTransaction<T>(callback: (client: any) => Promise<T>): Promise<T>;
}
