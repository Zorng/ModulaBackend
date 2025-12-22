import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import { Pool } from "pg";
import { randomUUID } from "crypto";
import { PgPolicyRepository } from "../infra/repository.js";

/**
 * Integration test for Policy Module inventory policy storage
 *
 * Tests that:
 * 1. Policy module ensures inventory_policies defaults exist
 * 2. Updates to auto_subtract_on_sale persist
 * 3. Branch overrides and exclusions persist across updates
 */

describe("Policy-Inventory Integration", () => {
  let pool: Pool;
  let policyRepo: PgPolicyRepository;
  const testTenantId = randomUUID();

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    policyRepo = new PgPolicyRepository(pool);

    await pool.query(
      `INSERT INTO tenants (id, name, business_type, status)
       VALUES ($1, 'Policy Integration Tenant', NULL, 'ACTIVE')
       ON CONFLICT (id) DO NOTHING`,
      [testTenantId]
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [testTenantId]);
    await pool.end();
  });

  test("should initialize inventory_policies when creating defaults", async () => {
    // Create default policies
    await policyRepo.ensureDefaultPolicies(testTenantId);

    const inventoryPolicyResult = await pool.query(
      `SELECT
         auto_subtract_on_sale,
         expiry_tracking_enabled,
         branch_overrides,
         exclude_menu_item_ids
       FROM inventory_policies
       WHERE tenant_id = $1`,
      [testTenantId]
    );
    expect(inventoryPolicyResult.rows.length).toBe(1);
    expect(inventoryPolicyResult.rows[0].auto_subtract_on_sale).toBe(true); // Default
    expect(inventoryPolicyResult.rows[0].expiry_tracking_enabled).toBe(false); // Default
    expect(inventoryPolicyResult.rows[0].branch_overrides).toEqual({});
    expect(inventoryPolicyResult.rows[0].exclude_menu_item_ids).toEqual([]);
  });

  test("should update auto_subtract_on_sale and preserve branch overrides", async () => {
    // Set up branch overrides
    const branchId = randomUUID();
    const overrides = { [branchId]: { inventorySubtractOnFinalize: true } };
    await pool.query(
      `UPDATE inventory_policies
       SET branch_overrides = $1
       WHERE tenant_id = $2`,
      [JSON.stringify(overrides), testTenantId]
    );

    // Update via policy module
    await policyRepo.updateTenantPolicies(testTenantId, {
      inventoryAutoSubtractOnSale: false, // Disable auto-subtract
    });

    // Check inventory_policies updated
    const inventoryPolicyResult = await pool.query(
      `SELECT
         auto_subtract_on_sale,
         branch_overrides
       FROM inventory_policies
       WHERE tenant_id = $1`,
      [testTenantId]
    );
    expect(inventoryPolicyResult.rows[0].auto_subtract_on_sale).toBe(false);
    const branchOverrides = inventoryPolicyResult.rows[0].branch_overrides;
    expect(branchOverrides[branchId]).toBeDefined();
    expect(branchOverrides[branchId].inventorySubtractOnFinalize).toBe(true);
  });

  test("should preserve menu item exclusions during updates", async () => {
    // Set up exclusions
    const excludedMenuItems = ["menu-item-1", "menu-item-2"];
    await pool.query(
      `UPDATE inventory_policies
       SET exclude_menu_item_ids = $1
       WHERE tenant_id = $2`,
      [JSON.stringify(excludedMenuItems), testTenantId]
    );

    // Update auto_subtract via policy module
    await policyRepo.updateTenantPolicies(testTenantId, {
      inventoryAutoSubtractOnSale: false,
    });

    // Check exclusions still exist
    const result = await pool.query(
      `SELECT exclude_menu_item_ids FROM inventory_policies WHERE tenant_id = $1`,
      [testTenantId]
    );
    const exclusions = result.rows[0].exclude_menu_item_ids;
    expect(exclusions).toEqual(excludedMenuItems);
  });

  test("should read combined policies correctly", async () => {
    // Get all policies
    const policies = await policyRepo.getTenantPolicies(testTenantId);

    expect(policies).not.toBeNull();
    expect(policies?.inventoryAutoSubtractOnSale).toBe(false); // From previous test
    expect(policies?.inventoryExpiryTrackingEnabled).toBe(false); // Default
  });
});
