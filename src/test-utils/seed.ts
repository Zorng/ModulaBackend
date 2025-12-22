import type { Pool } from "pg";
import { PasswordService } from "../modules/auth/app/password.service.js";
import type { AuthContext } from "../platform/security/auth.js";

export type SeedMenuTenantLimitsInput = Partial<{
  max_categories_soft: number;
  max_categories_hard: number;
  max_items_soft: number;
  max_items_hard: number;
  max_modifier_groups_per_item: number;
  max_modifier_options_per_group: number;
  max_total_modifier_options_per_item: number;
  max_media_quota_mb: number;
}>;

export type SeedTenantSingleBranchInput = Partial<{
  tenant: {
    name: string;
    business_type: string | null;
    status: "ACTIVE" | "PAST_DUE" | "EXPIRED" | "CANCELED";
  };
  branch: {
    name: string;
    address: string | null;
    status: "ACTIVE" | "FROZEN";
    contact_phone: string | null;
    contact_email: string | null;
  };
  admin: {
    phone: string;
    password: string;
    first_name: string;
    last_name: string;
    display_name: string | null;
    role: "ADMIN" | "MANAGER" | "CASHIER" | "CLERK";
  };
  ensureDefaultPolicies: boolean;
  ensureMenuTenantLimits: boolean;
  menuTenantLimits: SeedMenuTenantLimitsInput;
}>;

export type SeedTenantResult = {
  tenantId: string;
  branchId: string;
  accountId: string;
  employeeId: string;
  user: AuthContext;
  admin: {
    phone: string;
    password: string;
    role: "ADMIN" | "MANAGER" | "CASHIER" | "CLERK";
  };
};

export type SeedTenantMultiBranchResult = SeedTenantResult & {
  branchBId: string;
};

function makeUniquePhone(): string {
  // Needs to be unique across accounts.phone. Keep it deterministic-ish for logs.
  const now = Date.now().toString().slice(-9); // fits within VARCHAR(20)
  const rand = Math.floor(Math.random() * 1_000)
    .toString()
    .padStart(3, "0");
  return `+1${now}${rand}`;
}

export async function cleanupSeededTenant(
  pool: Pool,
  params: Pick<SeedTenantResult, "tenantId" | "accountId">
): Promise<void> {
  // Not everything is FK-linked to tenants yet; keep explicit cleanup for safety.
  // Inventory tables use tenant FKs without ON DELETE CASCADE in early migrations.
  await pool.query(`DELETE FROM inventory_journal WHERE tenant_id = $1`, [
    params.tenantId,
  ]);
  await pool.query(`DELETE FROM branch_stock WHERE tenant_id = $1`, [
    params.tenantId,
  ]);
  await pool.query(`DELETE FROM menu_stock_map WHERE tenant_id = $1`, [
    params.tenantId,
  ]);
  await pool.query(`DELETE FROM stock_items WHERE tenant_id = $1`, [
    params.tenantId,
  ]);
  await pool.query(`DELETE FROM inventory_categories WHERE tenant_id = $1`, [
    params.tenantId,
  ]);
  await pool.query(`DELETE FROM tenant_limits WHERE tenant_id = $1`, [
    params.tenantId,
  ]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [params.tenantId]);
  await pool.query(`DELETE FROM accounts WHERE id = $1`, [params.accountId]);
}

export async function setBranchStatus(params: {
  pool: Pool;
  tenantId: string;
  branchId: string;
  status: "ACTIVE" | "FROZEN";
}): Promise<void> {
  await params.pool.query(
    `UPDATE branches SET status = $3 WHERE tenant_id = $1 AND id = $2`,
    [params.tenantId, params.branchId, params.status]
  );
}

export async function ensureDefaultPolicies(
  pool: Pool,
  tenantId: string
): Promise<void> {
  await Promise.all([
    pool.query(
      `INSERT INTO sales_policies (tenant_id) VALUES ($1)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [tenantId]
    ),
    pool.query(
      `INSERT INTO inventory_policies (tenant_id) VALUES ($1)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [tenantId]
    ),
    pool.query(
      `INSERT INTO cash_session_policies (tenant_id) VALUES ($1)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [tenantId]
    ),
    pool.query(
      `INSERT INTO attendance_policies (tenant_id) VALUES ($1)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [tenantId]
    ),
  ]);
}

export async function ensureMenuTenantLimits(
  pool: Pool,
  tenantId: string,
  overrides?: SeedMenuTenantLimitsInput
): Promise<void> {
  const limits = {
    max_categories_soft: 8,
    max_categories_hard: 12,
    max_items_soft: 75,
    max_items_hard: 120,
    max_modifier_groups_per_item: 5,
    max_modifier_options_per_group: 12,
    max_total_modifier_options_per_item: 30,
    max_media_quota_mb: 10,
    ...overrides,
  };

  await pool.query(
    `INSERT INTO tenant_limits (
      tenant_id,
      max_categories_soft,
      max_categories_hard,
      max_items_soft,
      max_items_hard,
      max_modifier_groups_per_item,
      max_modifier_options_per_group,
      max_total_modifier_options_per_item,
      max_media_quota_mb
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (tenant_id) DO UPDATE SET
      max_categories_soft = EXCLUDED.max_categories_soft,
      max_categories_hard = EXCLUDED.max_categories_hard,
      max_items_soft = EXCLUDED.max_items_soft,
      max_items_hard = EXCLUDED.max_items_hard,
      max_modifier_groups_per_item = EXCLUDED.max_modifier_groups_per_item,
      max_modifier_options_per_group = EXCLUDED.max_modifier_options_per_group,
      max_total_modifier_options_per_item = EXCLUDED.max_total_modifier_options_per_item,
      max_media_quota_mb = EXCLUDED.max_media_quota_mb`,
    [
      tenantId,
      limits.max_categories_soft,
      limits.max_categories_hard,
      limits.max_items_soft,
      limits.max_items_hard,
      limits.max_modifier_groups_per_item,
      limits.max_modifier_options_per_group,
      limits.max_total_modifier_options_per_item,
      limits.max_media_quota_mb,
    ]
  );
}

export async function seedTenantSingleBranch(
  pool: Pool,
  input?: SeedTenantSingleBranchInput
): Promise<SeedTenantResult> {
  const tenantName = input?.tenant?.name ?? "Test Tenant";
  const tenantBusinessType = input?.tenant?.business_type ?? null;
  const tenantStatus = input?.tenant?.status ?? "ACTIVE";

  const branchName = input?.branch?.name ?? "Main Branch";
  const branchAddress = input?.branch?.address ?? "Primary business location";
  const branchStatus = input?.branch?.status ?? "ACTIVE";
  const branchContactPhone = input?.branch?.contact_phone ?? null;
  const branchContactEmail = input?.branch?.contact_email ?? null;

  const adminPhone = input?.admin?.phone ?? makeUniquePhone();
  const adminPassword = input?.admin?.password ?? "Test123!";
  const adminFirstName = input?.admin?.first_name ?? "Admin";
  const adminLastName = input?.admin?.last_name ?? "User";
  const adminDisplayName = input?.admin?.display_name ?? null;
  const adminRole = input?.admin?.role ?? "ADMIN";

  const ensurePolicies = input?.ensureDefaultPolicies ?? true;
  const ensureMenuLimits = input?.ensureMenuTenantLimits ?? true;

  const tenantRes = await pool.query(
    `INSERT INTO tenants (name, business_type, status)
     VALUES ($1,$2,$3)
     RETURNING id`,
    [tenantName, tenantBusinessType, tenantStatus]
  );
  const tenantId = tenantRes.rows[0].id as string;

  const branchRes = await pool.query(
    `INSERT INTO branches (tenant_id, name, address, status, contact_phone, contact_email)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id`,
    [
      tenantId,
      branchName,
      branchAddress,
      branchStatus,
      branchContactPhone,
      branchContactEmail,
    ]
  );
  const branchId = branchRes.rows[0].id as string;

  const passwordHash = await PasswordService.hashPassword(adminPassword);

  const accountRes = await pool.query(
    `INSERT INTO accounts (phone, password_hash, status)
     VALUES ($1,$2,'ACTIVE')
     RETURNING id`,
    [adminPhone, passwordHash]
  );
  const accountId = accountRes.rows[0].id as string;

  const employeeRes = await pool.query(
    `INSERT INTO employees (
      tenant_id,
      account_id,
      phone,
      email,
      password_hash,
      first_name,
      last_name,
      display_name,
      status,
      default_branch_id,
      last_branch_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE',$9,$9)
    RETURNING id`,
    [
      tenantId,
      accountId,
      adminPhone,
      null,
      passwordHash,
      adminFirstName,
      adminLastName,
      adminDisplayName,
      branchId,
    ]
  );
  const employeeId = employeeRes.rows[0].id as string;

  await pool.query(
    `INSERT INTO employee_branch_assignments (employee_id, branch_id, role, active)
     VALUES ($1,$2,$3,true)`,
    [employeeId, branchId, adminRole]
  );

  if (ensurePolicies) {
    await ensureDefaultPolicies(pool, tenantId);
  }

  if (ensureMenuLimits) {
    await ensureMenuTenantLimits(pool, tenantId, input?.menuTenantLimits);
  }

  return {
    tenantId,
    branchId,
    accountId,
    employeeId,
    user: {
      tenantId,
      employeeId,
      branchId,
      role: adminRole,
    },
    admin: {
      phone: adminPhone,
      password: adminPassword,
      role: adminRole,
    },
  };
}

export async function seedTenantMultiBranch(
  pool: Pool,
  input?: SeedTenantSingleBranchInput & {
    branchB?: Partial<SeedTenantSingleBranchInput["branch"]>;
    assignAdminToBranchB?: boolean;
  }
): Promise<SeedTenantMultiBranchResult> {
  const base = await seedTenantSingleBranch(pool, input);

  const branchBName = input?.branchB?.name ?? "Branch B";
  const branchBAddress = input?.branchB?.address ?? "Second business location";
  const branchBStatus = input?.branchB?.status ?? "ACTIVE";
  const branchBContactPhone = input?.branchB?.contact_phone ?? null;
  const branchBContactEmail = input?.branchB?.contact_email ?? null;

  const branchRes = await pool.query(
    `INSERT INTO branches (tenant_id, name, address, status, contact_phone, contact_email)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id`,
    [
      base.tenantId,
      branchBName,
      branchBAddress,
      branchBStatus,
      branchBContactPhone,
      branchBContactEmail,
    ]
  );
  const branchBId = branchRes.rows[0].id as string;

  const assignAdmin = input?.assignAdminToBranchB ?? true;
  if (assignAdmin) {
    await pool.query(
      `INSERT INTO employee_branch_assignments (employee_id, branch_id, role, active)
       VALUES ($1,$2,$3,true)
       ON CONFLICT (employee_id, branch_id) DO NOTHING`,
      [base.employeeId, branchBId, base.user.role]
    );
  }

  return { ...base, branchBId };
}

export async function seedMenuSetup(params: {
  pool: Pool;
  tenantId: string;
  branchId: string;
  createdByEmployeeId: string;
  categoryName?: string;
  menuItemName?: string;
  priceUsd?: number;
  branchOverride?: { isAvailable?: boolean; customPriceUsd?: number | null };
}): Promise<{ categoryId: string; menuItemId: string }> {
  const categoryName = params.categoryName ?? "Default Category";
  const menuItemName = params.menuItemName ?? "Test Item";
  const priceUsd = params.priceUsd ?? 1.0;

  const catRes = await params.pool.query(
    `INSERT INTO menu_categories (tenant_id, name, description, display_order, is_active, created_by)
     VALUES ($1,$2,'',0,true,$3)
     RETURNING id`,
    [params.tenantId, categoryName, params.createdByEmployeeId]
  );
  const categoryId = catRes.rows[0].id as string;

  const itemRes = await params.pool.query(
    `INSERT INTO menu_items (tenant_id, category_id, name, description, price_usd, image_url, is_active, created_by)
     VALUES ($1,$2,$3,'',$4,NULL,true,$5)
     RETURNING id`,
    [
      params.tenantId,
      categoryId,
      menuItemName,
      priceUsd,
      params.createdByEmployeeId,
    ]
  );
  const menuItemId = itemRes.rows[0].id as string;

  if (params.branchOverride) {
    await params.pool.query(
      `INSERT INTO menu_branch_items (
        tenant_id,
        branch_id,
        menu_item_id,
        is_available,
        custom_price_usd,
        display_order,
        updated_by
      ) VALUES ($1,$2,$3,$4,$5,0,$6)
      ON CONFLICT (tenant_id, branch_id, menu_item_id)
      DO UPDATE SET
        is_available = EXCLUDED.is_available,
        custom_price_usd = EXCLUDED.custom_price_usd,
        updated_by = EXCLUDED.updated_by`,
      [
        params.tenantId,
        params.branchId,
        menuItemId,
        params.branchOverride.isAvailable ?? true,
        params.branchOverride.customPriceUsd ?? null,
        params.createdByEmployeeId,
      ]
    );
  }

  return { categoryId, menuItemId };
}

export async function seedInventorySetup(params: {
  pool: Pool;
  tenantId: string;
  branchId: string;
  createdByEmployeeId: string;
  categoryName?: string;
  stockItemName?: string;
  unitText?: string;
  initialOnHand?: number;
}): Promise<{ inventoryCategoryId: string; stockItemId: string; branchStockId: string }> {
  const categoryName = params.categoryName ?? "Default Stock Category";
  const stockItemName = params.stockItemName ?? "Test Stock Item";
  const unitText = params.unitText ?? "pcs";
  const initialOnHand = params.initialOnHand ?? 10;

  const catRes = await params.pool.query(
    `INSERT INTO inventory_categories (tenant_id, name, display_order, is_active, created_by)
     VALUES ($1,$2,0,true,$3)
     RETURNING id`,
    [params.tenantId, categoryName, params.createdByEmployeeId]
  );
  const inventoryCategoryId = catRes.rows[0].id as string;

  const itemRes = await params.pool.query(
    `INSERT INTO stock_items (
      tenant_id,
      name,
      unit_text,
      barcode,
      piece_size,
      is_ingredient,
      is_sellable,
      category_id,
      image_url,
      is_active,
      created_by
    ) VALUES ($1,$2,$3,NULL,NULL,true,false,$4,NULL,true,$5)
    RETURNING id`,
    [
      params.tenantId,
      stockItemName,
      unitText,
      inventoryCategoryId,
      params.createdByEmployeeId,
    ]
  );
  const stockItemId = itemRes.rows[0].id as string;

  const branchStockRes = await params.pool.query(
    `INSERT INTO branch_stock (
      tenant_id,
      branch_id,
      stock_item_id,
      min_threshold,
      created_by
    ) VALUES ($1,$2,$3,0,$4)
    RETURNING id`,
    [params.tenantId, params.branchId, stockItemId, params.createdByEmployeeId]
  );
  const branchStockId = branchStockRes.rows[0].id as string;

  if (initialOnHand !== 0) {
    await params.pool.query(
      `INSERT INTO inventory_journal (
        tenant_id,
        branch_id,
        stock_item_id,
        delta,
        reason,
        ref_sale_id,
        note,
        actor_id,
        occurred_at,
        created_by
      ) VALUES ($1,$2,$3,$4,'receive',NULL,'seed', $5, NOW(), $5)`,
      [
        params.tenantId,
        params.branchId,
        stockItemId,
        initialOnHand,
        params.createdByEmployeeId,
      ]
    );
  }

  return { inventoryCategoryId, stockItemId, branchStockId };
}

export async function seedMenuStockMap(params: {
  pool: Pool;
  tenantId: string;
  menuItemId: string;
  stockItemId: string;
  qtyPerSale?: number;
  createdByEmployeeId: string;
}): Promise<{ menuStockMapId: string }> {
  const qtyPerSale = params.qtyPerSale ?? 1;
  const res = await params.pool.query(
    `INSERT INTO menu_stock_map (
      menu_item_id,
      tenant_id,
      stock_item_id,
      qty_per_sale,
      created_by
    ) VALUES ($1,$2,$3,$4,$5)
    RETURNING id`,
    [
      params.menuItemId,
      params.tenantId,
      params.stockItemId,
      qtyPerSale,
      params.createdByEmployeeId,
    ]
  );
  return { menuStockMapId: res.rows[0].id as string };
}

export async function seedCashSetup(params: {
  pool: Pool;
  tenantId: string;
  branchId: string;
  name?: string;
}): Promise<{ registerId: string }> {
  const name = params.name ?? "Main Register";
  const res = await params.pool.query(
    `INSERT INTO cash_registers (tenant_id, branch_id, name, status)
     VALUES ($1,$2,$3,'ACTIVE')
     RETURNING id`,
    [params.tenantId, params.branchId, name]
  );
  return { registerId: res.rows[0].id as string };
}
