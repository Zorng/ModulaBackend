import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import { Pool } from "pg";
import { PgPolicyRepository } from "../infra/repository.js";
import { InventorySyncAdapter } from "../infra/inventory-sync.adapter.js";

/**
 * Integration test for Policy Module <-> Inventory Module sync
 * 
 * Tests that:
 * 1. Policy module's inventory_policies table syncs with store_policy_inventory
 * 2. Updates to auto_subtract_on_sale propagate correctly
 * 3. Branch overrides and exclusions are preserved during sync
 */

describe("Policy-Inventory Integration", () => {
  let pool: Pool;
  let policyRepo: PgPolicyRepository;
  let syncAdapter: InventorySyncAdapter;
  const testTenantId = "test-tenant-policy-inventory-integration";

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    policyRepo = new PgPolicyRepository(pool);
    syncAdapter = new InventorySyncAdapter(pool);

    // Clean up test data
    await pool.query(
      `DELETE FROM inventory_policies WHERE tenant_id = $1`,
      [testTenantId]
    );
    await pool.query(
      `DELETE FROM store_policy_inventory WHERE tenant_id = $1`,
      [testTenantId]
    );
  });

  afterAll(async () => {
    // Clean up
    await pool.query(
      `DELETE FROM inventory_policies WHERE tenant_id = $1`,
      [testTenantId]
    );
    await pool.query(
      `DELETE FROM store_policy_inventory WHERE tenant_id = $1`,
      [testTenantId]
    );
    await pool.end();
  });

  test("should initialize both policy tables when creating defaults", async () => {
    // Create default policies
    await policyRepo.ensureDefaultPolicies(testTenantId);

    // Check inventory_policies exists
    const inventoryPolicyResult = await pool.query(
      `SELECT * FROM inventory_policies WHERE tenant_id = $1`,
      [testTenantId]
    );
    expect(inventoryPolicyResult.rows.length).toBe(1);
    expect(inventoryPolicyResult.rows[0].auto_subtract_on_sale).toBe(true); // Default

    // Check store_policy_inventory exists
    const storePolicyResult = await pool.query(
      `SELECT * FROM store_policy_inventory WHERE tenant_id = $1`,
      [testTenantId]
    );
    expect(storePolicyResult.rows.length).toBe(1);
    expect(storePolicyResult.rows[0].inventory_subtract_on_finalize).toBe(true); // Default
  });

  test("should sync auto_subtract_on_sale from inventory_policies to store_policy_inventory", async () => {
    // Update via policy module
    await policyRepo.updateTenantPolicies(testTenantId, {
      inventoryAutoSubtractOnSale: false, // Disable auto-subtract
    });

    // Check inventory_policies updated
    const inventoryPolicyResult = await pool.query(
      `SELECT * FROM inventory_policies WHERE tenant_id = $1`,
      [testTenantId]
    );
    expect(inventoryPolicyResult.rows[0].auto_subtract_on_sale).toBe(false);

    // Check store_policy_inventory synced
    const storePolicyResult = await pool.query(
      `SELECT * FROM store_policy_inventory WHERE tenant_id = $1`,
      [testTenantId]
    );
    expect(storePolicyResult.rows[0].inventory_subtract_on_finalize).toBe(false);
  });

  test("should preserve branch overrides during sync", async () => {
    // Set up branch overrides in store_policy_inventory
    const branchId = "test-branch-123";
    await pool.query(
      `UPDATE store_policy_inventory 
       SET branch_overrides = $1
       WHERE tenant_id = $2`,
      [
        JSON.stringify({
          [branchId]: { inventorySubtractOnFinalize: true },
        }),
        testTenantId,
      ]
    );

    // Update auto_subtract via policy module
    await policyRepo.updateTenantPolicies(testTenantId, {
      inventoryAutoSubtractOnSale: true, // Re-enable
    });

    // Check branch overrides still exist
    const result = await pool.query(
      `SELECT branch_overrides FROM store_policy_inventory WHERE tenant_id = $1`,
      [testTenantId]
    );
    const branchOverrides = result.rows[0].branch_overrides;
    expect(branchOverrides[branchId]).toBeDefined();
    expect(branchOverrides[branchId].inventorySubtractOnFinalize).toBe(true);
  });

  test("should preserve menu item exclusions during sync", async () => {
    // Set up exclusions in store_policy_inventory
    const excludedMenuItems = ["menu-item-1", "menu-item-2"];
    await pool.query(
      `UPDATE store_policy_inventory 
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
      `SELECT exclude_menu_item_ids FROM store_policy_inventory WHERE tenant_id = $1`,
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

  test("sync adapter should handle missing store_policy_inventory gracefully", async () => {
    const newTenantId = "test-tenant-new-sync";

    // Clean up first
    await pool.query(
      `DELETE FROM inventory_policies WHERE tenant_id = $1`,
      [newTenantId]
    );
    await pool.query(
      `DELETE FROM store_policy_inventory WHERE tenant_id = $1`,
      [newTenantId]
    );

    // Create only inventory_policies
    await pool.query(
      `INSERT INTO inventory_policies (tenant_id, auto_subtract_on_sale) VALUES ($1, true)`,
      [newTenantId]
    );

    // Sync should create store_policy_inventory
    await syncAdapter.syncAutoSubtractSetting(newTenantId, true);

    // Check store_policy_inventory was created
    const result = await pool.query(
      `SELECT * FROM store_policy_inventory WHERE tenant_id = $1`,
      [newTenantId]
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].inventory_subtract_on_finalize).toBe(true);

    // Clean up
    await pool.query(
      `DELETE FROM inventory_policies WHERE tenant_id = $1`,
      [newTenantId]
    );
    await pool.query(
      `DELETE FROM store_policy_inventory WHERE tenant_id = $1`,
      [newTenantId]
    );
  });
});

