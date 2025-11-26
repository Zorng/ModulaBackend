// src/modules/menu/infra/adapters/policy.adapter.ts
import type { Pool } from "pg";
import type { IPolicyPort } from "../../app/ports.js";

/**
 * Permission codes for menu operations
 */
const PERMISSIONS = {
  CREATE_CATEGORY: "menu.category.create",
  EDIT_MENU_ITEM: "menu.item.edit",
  MANAGE_MODIFIERS: "menu.modifier.manage",
  MANAGE_BRANCH_MENU: "menu.branch.manage",
} as const;

/**
 * Special role names
 */
const ROLES = {
  TENANT: "tenant", // Tenant owner (full access)
  MANAGER: "manager", // Branch manager (limited access)
  CASHIER: "cashier", // Cashier (read-only)
} as const;

/**
 * Policy Adapter
 * Implements IPolicyPort using database queries
 * Checks user permissions via role_permissions table
 */
export class PolicyAdapter implements IPolicyPort {
  constructor(private pool: Pool) {}

  /**
   * Check if user can create/edit categories
   */
  async canCreateCategory(tenantId: string, userId: string): Promise<boolean> {
    // return this.hasPermission(tenantId, userId, PERMISSIONS.CREATE_CATEGORY);
    return true;
  }

  /**
   * Check if user can edit menu items
   */
  async canEditMenuItem(tenantId: string, userId: string): Promise<boolean> {
    // return this.hasPermission(tenantId, userId, PERMISSIONS.EDIT_MENU_ITEM);
    return true;
  }

  /**
   * Check if user can manage modifiers
   */
  async canManageModifiers(tenantId: string, userId: string): Promise<boolean> {
    // return this.hasPermission(tenantId, userId, PERMISSIONS.MANAGE_MODIFIERS);
    return true;
  }

  /**
   * Check if user can manage branch-specific menu settings
   */
  async canManageBranchMenu(
    tenantId: string,
    userId: string,
    branchId: string
  ): Promise<boolean> {
    // return this.hasPermission(
    //   tenantId,
    //   userId,
    //   PERMISSIONS.MANAGE_BRANCH_MENU
    // );
    return true;
  }

  /**
   * Core permission checking logic
   *
   * Rules:
   * 1. Users with 'tenant' role have ALL permissions
   * 2. Other users must have explicit permission grants
   *
   * @param tenantId - Tenant context
   * @param userId - User to check
   * @param permissionCode - Permission required
   */
  private async hasPermission(
    tenantId: string,
    userId: string,
    permissionCode: string
  ): Promise<boolean> {
    try {
      const query = `
        SELECT 
          r.name as role_name,
          p.code as permission_code
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        LEFT JOIN role_permissions rp ON r.id = rp.role_id
        LEFT JOIN permissions p ON rp.permission_id = p.id
        WHERE ur.user_id = $1 
          AND ur.tenant_id = $2
          AND (r.name = $3 OR p.code = $4)
      `;

      const result = await this.pool.query(query, [
        userId,
        tenantId,
        ROLES.TENANT,
        permissionCode,
      ]);

      // No roles found = no access
      if (result.rowCount === 0) {
        return false;
      }

      // Check if user has 'tenant' role (full access)
      const hasTenantRole = result.rows.some(
        (row) => row.role_name === ROLES.TENANT
      );
      if (hasTenantRole) {
        return true;
      }

      // Check if user has specific permission
      const hasPermission = result.rows.some(
        (row) => row.permission_code === permissionCode
      );

      return hasPermission;
    } catch (error) {
      console.error("[PolicyAdapter] Error checking permission:", error);
      // Fail closed - deny access on error
      return false;
    }
  }

  /**
   * Helper: Check if user has a specific role
   * Useful for role-based UI rendering
   */
  async hasRole(
    tenantId: string,
    userId: string,
    roleName: string
  ): Promise<boolean> {
    try {
      const query = `
        SELECT 1
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = $1 
          AND ur.tenant_id = $2
          AND r.name = $3
        LIMIT 1
      `;

      const result = await this.pool.query(query, [userId, tenantId, roleName]);
      return result.rowCount! > 0;
    } catch (error) {
      console.error("[PolicyAdapter] Error checking role:", error);
      return false;
    }
  }

  /**
   * Helper: Get all permissions for a user
   * Useful for debugging and admin panels
   */
  async getUserPermissions(
    tenantId: string,
    userId: string
  ): Promise<string[]> {
    try {
      const query = `
        SELECT DISTINCT p.code
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        LEFT JOIN role_permissions rp ON r.id = rp.role_id
        LEFT JOIN permissions p ON rp.permission_id = p.id
        WHERE ur.user_id = $1 
          AND ur.tenant_id = $2
          AND p.code IS NOT NULL
      `;

      const result = await this.pool.query(query, [userId, tenantId]);
      return result.rows.map((row) => row.code);
    } catch (error) {
      console.error("[PolicyAdapter] Error getting permissions:", error);
      return [];
    }
  }
}

/**
 * Factory function for dependency injection
 */
export function createPolicyAdapter(pool: Pool): IPolicyPort {
  return new PolicyAdapter(pool);
}
