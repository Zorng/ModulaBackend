import { Pool } from "pg";
import { IPolicyPort } from "#modules/menu/app/ports.js";

// Permission codes
const PERMISSIONS = {
  CREATE_CATEGORY: "menu.category.create",
  EDIT_MENU_ITEM: "menu.item.edit",
  MANAGE_MODIFIERS: "menu.modifier.manage",
  MANAGE_BRANCH_MENU: "menu.branch.manage",
} as const;

// Role names
const TENANT_ROLE = "tenant";

export class PolicyRepository implements IPolicyPort {
  constructor(private pool: Pool) {}

  async canCreateCategory(tenantId: string, userId: string): Promise<boolean> {
    return this.hasPermission(tenantId, userId, PERMISSIONS.CREATE_CATEGORY);
  }

  async canEditMenuItem(tenantId: string, userId: string): Promise<boolean> {
    return this.hasPermission(tenantId, userId, PERMISSIONS.EDIT_MENU_ITEM);
  }

  async canManageBranchMenu(
    tenantId: string,
    userId: string,
    branchId: string
  ): Promise<boolean> {
    // branchId could be used for branch-specific overrides in future
    return this.hasPermission(tenantId, userId, PERMISSIONS.MANAGE_BRANCH_MENU);
  }

  async canManageModifiers(tenantId: string, userId: string): Promise<boolean> {
    return this.hasPermission(tenantId, userId, PERMISSIONS.MANAGE_MODIFIERS);
  }

  /**
   * Checks if the user has the required permission in the tenant.
   * - If user has 'tenant' role, always returns true (tenant admin)
   * - Otherwise checks if user has any role with the specific permission
   */
  private async hasPermission(
    tenantId: string,
    userId: string,
    permissionCode: string
  ): Promise<boolean> {
    try {
      const query = `
        SELECT 
          r.name,
          p.code
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
        TENANT_ROLE,
        permissionCode,
      ]);

      if (result.rowCount === 0) {
        return false;
      }

      // Check if user has tenant role (superuser)
      const hasTenantRole = result.rows.some(
        (row: any) => row.name === TENANT_ROLE
      );
      if (hasTenantRole) {
        return true;
      }

      // Check if user has the specific permission
      const hasPermission = result.rows.some(
        (row: any) => row.code === permissionCode
      );
      return hasPermission;
    } catch (error) {
      console.error("Error checking permission:", error);
      return false; 
    }
  }
}
