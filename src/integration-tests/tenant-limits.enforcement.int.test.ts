import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import type { Pool, PoolClient } from "pg";
import { createTestPool } from "../test-utils/db.js";
import { cleanupSeededTenant, seedTenantSingleBranch } from "../test-utils/seed.js";
import { MenuItemRepository } from "../modules/menu/infra/repositories/menuItem.js";
import { CategoryRepository } from "../modules/menu/infra/repositories/category.js";
import { TenantLimitsRepository as MenuTenantLimitsRepository } from "../modules/menu/infra/repositories/tenantLimits.js";
import { CreateMenuItemUseCase } from "../modules/menu/app/use-cases/menu-item/create-menu-item.js";
import { DeleteMenuItemUseCase } from "../modules/menu/app/use-cases/menu-item/delete-menu-item.js";
import { RestoreMenuItemUseCase } from "../modules/menu/app/use-cases/menu-item/restore-menu-item.js";
import { StockItemRepository } from "../modules/inventory/infra/stockItem.repository.js";
import { PgInventoryTenantLimitsRepository } from "../modules/inventory/infra/tenantLimits.repository.js";
import { CreateStockItemUseCase } from "../modules/inventory/app/stockitem-usecase/create-stock-item.use-case.js";
import { UpdateStockItemUseCase } from "../modules/inventory/app/stockitem-usecase/update-stock-item.use-case.js";
import { PasswordService } from "../modules/auth/app/password.service.js";
import { StaffManagementRepository } from "../modules/staffManagement/infra/repository.js";
import {
  StaffManagementService,
  createInvitationPort,
} from "../modules/staffManagement/app/staffManagement.service.js";

function shouldCleanupAfterTests(): boolean {
  const value = process.env.CLEANUP_AFTER_TESTS;
  if (!value) return false;
  return value === "1" || value.toLowerCase() === "true";
}

function createTxManager(pool: Pool) {
  return {
    async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

function uniquePhone(): string {
  const now = Date.now().toString().slice(-9);
  const rand = Math.floor(Math.random() * 1_000)
    .toString()
    .padStart(3, "0");
  return `+1${now}${rand}`;
}

async function createAccount(pool: Pool, phone: string, password = "Test123!") {
  const passwordHash = await PasswordService.hashPassword(password);
  const res = await pool.query(
    `INSERT INTO accounts (phone, password_hash, status)
     VALUES ($1,$2,'ACTIVE')
     RETURNING id`,
    [phone, passwordHash]
  );
  return { accountId: res.rows[0].id as string, passwordHash };
}

describe("Tenant limits enforcement (DB-backed)", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("menu items: soft limit blocks create; archive frees soft slot", async () => {
    const seeded = await seedTenantSingleBranch(pool, {
      menuTenantLimits: { max_items_soft: 1 },
    });

    const categoryRes = await pool.query(
      `INSERT INTO menu_categories (tenant_id, name, description, display_order, is_active, created_by)
       VALUES ($1,'Test Category','',0,true,$2)
       RETURNING id`,
      [seeded.tenantId, seeded.employeeId]
    );
    const categoryId = categoryRes.rows[0].id as string;

    const menuItemRepo = new MenuItemRepository(pool);
    const categoryRepo = new CategoryRepository(pool);
    const limitsRepo = new MenuTenantLimitsRepository(pool);
    const txManager = createTxManager(pool);

    const policyPort = {
      canEditMenuItem: async () => true,
    } as any;
    const imageStorage = {
      uploadImage: async () => {
        throw new Error("not implemented in tests");
      },
      isValidImageUrl: () => true,
    } as any;
    const eventBus = { publishViaOutbox: async () => {} } as any;

    const createMenuItem = new CreateMenuItemUseCase(
      menuItemRepo,
      categoryRepo,
      limitsRepo,
      imageStorage,
      policyPort,
      eventBus,
      txManager as any
    );
    const deleteMenuItem = new DeleteMenuItemUseCase(
      menuItemRepo,
      policyPort,
      eventBus,
      txManager as any
    );
    const restoreMenuItem = new RestoreMenuItemUseCase(
      menuItemRepo,
      limitsRepo,
      policyPort,
      eventBus,
      txManager as any
    );

    const item1 = await createMenuItem.execute({
      tenantId: seeded.tenantId,
      userId: seeded.employeeId,
      categoryId,
      name: "Item 1",
      priceUsd: 1,
    });
    expect(item1.ok).toBe(true);
    const item1Id = item1.ok ? item1.value.id : "";

    const item2Blocked = await createMenuItem.execute({
      tenantId: seeded.tenantId,
      userId: seeded.employeeId,
      categoryId,
      name: "Item 2",
      priceUsd: 2,
    });
    expect(item2Blocked.ok).toBe(false);
    if (!item2Blocked.ok) {
      expect(item2Blocked.error.toLowerCase()).toContain("limit");
    }

    const archived = await deleteMenuItem.execute({
      tenantId: seeded.tenantId,
      userId: seeded.employeeId,
      menuItemId: item1Id,
    });
    expect(archived.ok).toBe(true);

    const item2Allowed = await createMenuItem.execute({
      tenantId: seeded.tenantId,
      userId: seeded.employeeId,
      categoryId,
      name: "Item 2 (after archive)",
      priceUsd: 2,
    });
    expect(item2Allowed.ok).toBe(true);

    const restoreBlocked = await restoreMenuItem.execute({
      tenantId: seeded.tenantId,
      userId: seeded.employeeId,
      menuItemId: item1Id,
    });
    expect(restoreBlocked.ok).toBe(false);
    if (!restoreBlocked.ok) {
      expect(restoreBlocked.error.toLowerCase()).toContain("limit");
    }

    await cleanupSeededTenant(pool, seeded);
  });

  it("inventory stock items: soft limit blocks create; archive frees soft slot; restore blocked when soft exceeded", async () => {
    const seeded = await seedTenantSingleBranch(pool);
    await pool.query(
      `UPDATE tenant_limits
       SET max_stock_items_soft = 1,
           max_stock_items_hard = 10
       WHERE tenant_id = $1`,
      [seeded.tenantId]
    );

    const stockItemRepo = new StockItemRepository(pool);
    const tenantLimitsRepo = new PgInventoryTenantLimitsRepository(pool);
    const txManager = createTxManager(pool);

    const eventBus = { publishViaOutbox: async () => {} } as any;
    const imageStorage = {
      uploadImage: async () => {
        throw new Error("not implemented in tests");
      },
      isValidImageUrl: () => true,
    } as any;
    const auditWriter = { write: async () => {} } as any;

    const createStockItem = new CreateStockItemUseCase(
      stockItemRepo,
      tenantLimitsRepo,
      eventBus,
      txManager as any,
      imageStorage,
      auditWriter
    );
    const updateStockItem = new UpdateStockItemUseCase(
      stockItemRepo,
      tenantLimitsRepo,
      eventBus,
      txManager as any,
      imageStorage,
      auditWriter
    );

    const item1 = await createStockItem.execute({
      tenantId: seeded.tenantId,
      userId: seeded.employeeId,
      name: "Stock 1",
      unitText: "pcs",
      isIngredient: true,
      isSellable: false,
      isActive: true,
    });
    expect(item1.ok).toBe(true);
    const item1Id = item1.ok ? item1.value.id : "";

    const item2Blocked = await createStockItem.execute({
      tenantId: seeded.tenantId,
      userId: seeded.employeeId,
      name: "Stock 2",
      unitText: "pcs",
      isIngredient: true,
      isSellable: false,
      isActive: true,
    });
    expect(item2Blocked.ok).toBe(false);
    if (!item2Blocked.ok) {
      expect(item2Blocked.error.toLowerCase()).toContain("limit");
    }

    const archived = await updateStockItem.execute(item1Id, seeded.employeeId, {
      isActive: false,
    });
    expect(archived.ok).toBe(true);

    const item2Allowed = await createStockItem.execute({
      tenantId: seeded.tenantId,
      userId: seeded.employeeId,
      name: "Stock 2 (after archive)",
      unitText: "pcs",
      isIngredient: true,
      isSellable: false,
      isActive: true,
    });
    expect(item2Allowed.ok).toBe(true);

    const restoreBlocked = await updateStockItem.execute(item1Id, seeded.employeeId, {
      isActive: true,
    });
    expect(restoreBlocked.ok).toBe(false);
    if (!restoreBlocked.ok) {
      expect(restoreBlocked.error.toLowerCase()).toContain("limit");
    }

    await cleanupSeededTenant(pool, seeded);
  });

  it("staff seats: accept/reactivate blocked at soft limit; disable frees active slot", async () => {
    const seeded = await seedTenantSingleBranch(pool);
    await pool.query(
      `UPDATE tenant_limits
       SET max_staff_seats_soft = 2,
           max_staff_seats_hard = 3
       WHERE tenant_id = $1`,
      [seeded.tenantId]
    );

    const repo = new StaffManagementRepository(pool);
    const service = new StaffManagementService(repo, 72);
    const invitationPort = createInvitationPort(repo);

    const invite1Phone = uniquePhone();
    const invite1 = await service.createInvite(seeded.tenantId, seeded.employeeId, {
      first_name: "Staff",
      last_name: "One",
      phone: invite1Phone,
      role: "CASHIER",
      branch_id: seeded.branchId,
    });

    const invite2Phone = uniquePhone();
    const invite2 = await service.createInvite(seeded.tenantId, seeded.employeeId, {
      first_name: "Staff",
      last_name: "Two",
      phone: invite2Phone,
      role: "CASHIER",
      branch_id: seeded.branchId,
    });

    const createdAccounts: string[] = [];
    try {
      const acc1 = await createAccount(pool, invite1Phone);
      createdAccounts.push(acc1.accountId);

      const accepted1 = await invitationPort.acceptInvite({
        token: invite1.token_hash,
        accountId: acc1.accountId,
        passwordHash: acc1.passwordHash,
      });

      const acc2 = await createAccount(pool, invite2Phone);
      createdAccounts.push(acc2.accountId);

      await expect(
        invitationPort.acceptInvite({
          token: invite2.token_hash,
          accountId: acc2.accountId,
          passwordHash: acc2.passwordHash,
        })
      ).rejects.toThrow(/seat|limit/i);

      await service.disableEmployee(
        seeded.tenantId,
        accepted1.employee.id,
        seeded.employeeId
      );

      const accepted2 = await invitationPort.acceptInvite({
        token: invite2.token_hash,
        accountId: acc2.accountId,
        passwordHash: acc2.passwordHash,
      });
      expect(accepted2.employee.status).toBe("ACTIVE");

      await expect(
        service.reactivateEmployee(
          seeded.tenantId,
          accepted1.employee.id,
          seeded.employeeId
        )
      ).rejects.toThrow(/seat|limit/i);
    } finally {
      if (shouldCleanupAfterTests()) {
        for (const accountId of createdAccounts) {
          await pool.query(`DELETE FROM accounts WHERE id = $1`, [accountId]);
        }
      }
      await cleanupSeededTenant(pool, seeded);
    }
  });

  it("staff seats: archived staff counts toward hard limit (blocks invites)", async () => {
    const seeded = await seedTenantSingleBranch(pool);
    await pool.query(
      `UPDATE tenant_limits
       SET max_staff_seats_soft = 2,
           max_staff_seats_hard = 2
       WHERE tenant_id = $1`,
      [seeded.tenantId]
    );

    const repo = new StaffManagementRepository(pool);
    const service = new StaffManagementService(repo, 72);
    const invitationPort = createInvitationPort(repo);

    const staffPhone = uniquePhone();
    const invite = await service.createInvite(seeded.tenantId, seeded.employeeId, {
      first_name: "Staff",
      last_name: "Archive",
      phone: staffPhone,
      role: "CASHIER",
      branch_id: seeded.branchId,
    });

    const account = await createAccount(pool, staffPhone);
    try {
      const accepted = await invitationPort.acceptInvite({
        token: invite.token_hash,
        accountId: account.accountId,
        passwordHash: account.passwordHash,
      });

      await service.archiveEmployee(
        seeded.tenantId,
        accepted.employee.id,
        seeded.employeeId
      );

      await expect(
        service.createInvite(seeded.tenantId, seeded.employeeId, {
          first_name: "Staff",
          last_name: "Blocked",
          phone: uniquePhone(),
          role: "CASHIER",
          branch_id: seeded.branchId,
        })
      ).rejects.toThrow(/hard limit|seat/i);
    } finally {
      if (shouldCleanupAfterTests()) {
        await pool.query(`DELETE FROM accounts WHERE id = $1`, [account.accountId]);
      }
      await cleanupSeededTenant(pool, seeded);
    }
  });
});
