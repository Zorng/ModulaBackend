import { Pool, type PoolClient } from "pg";
import { V0PasswordService } from "../../modules/v0/auth/app/password.service.js";
import {
  expectedLocalEnvFilename,
  loadEnvironment,
} from "../config/env.js";

type BranchKey = "bkk1" | "tk";
type AccountRole = "OWNER" | "MANAGER" | "CASHIER" | "CLERK";

type DemoAccountSpec = {
  key: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: AccountRole;
  branchKeys: BranchKey[];
  createStaffProfile: boolean;
};

type DemoBranchSpec = {
  key: BranchKey;
  name: string;
  address: string;
  contactPhone: string;
  khqrReceiverAccountId: string;
  khqrReceiverName: string;
};

type MenuItemSpec = {
  name: string;
  categoryName: string;
  basePriceUsd: number;
  visibleBranchKeys: BranchKey[];
  modifierGroupNames: string[];
  baseComponents: ReadonlyArray<{
    stockItemName: string;
    quantityInBaseUnit: number;
    trackingMode: "TRACKED" | "NOT_TRACKED";
  }>;
};

const { nodeEnv, appEnv } = loadEnvironment("development");
const expectedLocalEnvFile = expectedLocalEnvFilename(nodeEnv, appEnv);

const DEMO_TENANT_NAME = "Mekong Brew Cafe";
const DEMO_PASSWORD = process.env.DEMO_SEED_PASSWORD?.trim() || "CafeDemo123!";

const BRANCHES: readonly DemoBranchSpec[] = [
  {
    key: "bkk1",
    name: "Mekong Brew BKK1",
    address: "Street 51, BKK1, Phnom Penh",
    contactPhone: "+85510200001",
    khqrReceiverAccountId: "mekongbrew.bkk1@bkrt",
    khqrReceiverName: "Mekong Brew BKK1",
  },
  {
    key: "tk",
    name: "Mekong Brew Toul Kork",
    address: "Street 289, Toul Kork, Phnom Penh",
    contactPhone: "+85510200002",
    khqrReceiverAccountId: "mekongbrew.tk@bkrt",
    khqrReceiverName: "Mekong Brew Toul Kork",
  },
] as const;

const ACCOUNTS: readonly DemoAccountSpec[] = [
  {
    key: "owner",
    firstName: "Dara",
    lastName: "Sok",
    phone: "+85510100001",
    role: "OWNER",
    branchKeys: ["bkk1", "tk"],
    createStaffProfile: false,
  },
  {
    key: "mgr_bkk1",
    firstName: "Sreyneang",
    lastName: "Chan",
    phone: "+85510100002",
    role: "MANAGER",
    branchKeys: ["bkk1"],
    createStaffProfile: true,
  },
  {
    key: "cashier_bkk1_a",
    firstName: "Vanna",
    lastName: "Lim",
    phone: "+85510100003",
    role: "CASHIER",
    branchKeys: ["bkk1"],
    createStaffProfile: true,
  },
  {
    key: "cashier_bkk1_b",
    firstName: "Sophea",
    lastName: "Kim",
    phone: "+85510100004",
    role: "CASHIER",
    branchKeys: ["bkk1"],
    createStaffProfile: true,
  },
  {
    key: "clerk_bkk1",
    firstName: "Lina",
    lastName: "Phan",
    phone: "+85510100005",
    role: "CLERK",
    branchKeys: ["bkk1"],
    createStaffProfile: true,
  },
  {
    key: "mgr_tk",
    firstName: "Piseth",
    lastName: "Ouk",
    phone: "+85510100006",
    role: "MANAGER",
    branchKeys: ["tk"],
    createStaffProfile: true,
  },
  {
    key: "cashier_tk_a",
    firstName: "Mony",
    lastName: "Roth",
    phone: "+85510100007",
    role: "CASHIER",
    branchKeys: ["tk"],
    createStaffProfile: true,
  },
  {
    key: "cashier_tk_b",
    firstName: "Chanra",
    lastName: "Dev",
    phone: "+85510100008",
    role: "CASHIER",
    branchKeys: ["tk"],
    createStaffProfile: true,
  },
  {
    key: "clerk_tk",
    firstName: "Davy",
    lastName: "Touch",
    phone: "+85510100009",
    role: "CLERK",
    branchKeys: ["tk"],
    createStaffProfile: true,
  },
] as const;

const MENU_CATEGORIES = ["Espresso Bar", "Tea & Signature", "Bakery"] as const;

const MODIFIER_GROUPS = [
  {
    name: "Size",
    selectionMode: "SINGLE",
    minSelections: 1,
    maxSelections: 1,
    isRequired: true,
    options: [
      { label: "Small", priceDelta: 0 },
      { label: "Regular", priceDelta: 0.5 },
      { label: "Large", priceDelta: 1.0 },
    ],
  },
  {
    name: "Milk Choice",
    selectionMode: "SINGLE",
    minSelections: 0,
    maxSelections: 1,
    isRequired: false,
    options: [
      { label: "Whole Milk", priceDelta: 0 },
      { label: "Oat Milk", priceDelta: 0.75 },
    ],
  },
  {
    name: "Ice Level",
    selectionMode: "SINGLE",
    minSelections: 0,
    maxSelections: 1,
    isRequired: false,
    options: [
      { label: "No Ice", priceDelta: 0 },
      { label: "Less Ice", priceDelta: 0 },
      { label: "Regular Ice", priceDelta: 0 },
    ],
  },
  {
    name: "Add-ons",
    selectionMode: "MULTI",
    minSelections: 0,
    maxSelections: 2,
    isRequired: false,
    options: [
      { label: "Extra Shot", priceDelta: 0.75 },
      { label: "Whipped Cream", priceDelta: 0.5 },
    ],
  },
] as const;

const INVENTORY_CATEGORIES = [
  "Coffee & Tea Base",
  "Dairy & Syrups",
  "Bakery Stock",
  "Packaging",
] as const;

const INVENTORY_ITEMS = [
  {
    name: "Espresso Beans",
    categoryName: "Coffee & Tea Base",
    baseUnit: "g",
    lowStockThreshold: 1000,
  },
  {
    name: "Tea Leaves",
    categoryName: "Coffee & Tea Base",
    baseUnit: "g",
    lowStockThreshold: 800,
  },
  {
    name: "Matcha Powder",
    categoryName: "Coffee & Tea Base",
    baseUnit: "g",
    lowStockThreshold: 400,
  },
  {
    name: "Whole Milk",
    categoryName: "Dairy & Syrups",
    baseUnit: "ml",
    lowStockThreshold: 3000,
  },
  {
    name: "Oat Milk",
    categoryName: "Dairy & Syrups",
    baseUnit: "ml",
    lowStockThreshold: 1500,
  },
  {
    name: "Chocolate Syrup",
    categoryName: "Dairy & Syrups",
    baseUnit: "ml",
    lowStockThreshold: 800,
  },
  {
    name: "Croissant Piece",
    categoryName: "Bakery Stock",
    baseUnit: "pcs",
    lowStockThreshold: 10,
  },
  {
    name: "Banana Bread Slice",
    categoryName: "Bakery Stock",
    baseUnit: "pcs",
    lowStockThreshold: 8,
  },
  {
    name: "Ham & Cheese Croissant Piece",
    categoryName: "Bakery Stock",
    baseUnit: "pcs",
    lowStockThreshold: 6,
  },
  {
    name: "Hot Cup 12oz",
    categoryName: "Packaging",
    baseUnit: "pcs",
    lowStockThreshold: 50,
  },
  {
    name: "Cold Cup 16oz",
    categoryName: "Packaging",
    baseUnit: "pcs",
    lowStockThreshold: 50,
  },
  {
    name: "Cup Lid",
    categoryName: "Packaging",
    baseUnit: "pcs",
    lowStockThreshold: 80,
  },
  {
    name: "Paper Bag",
    categoryName: "Packaging",
    baseUnit: "pcs",
    lowStockThreshold: 20,
  },
] as const;

const MENU_ITEMS: readonly MenuItemSpec[] = [
  {
    name: "Espresso",
    categoryName: "Espresso Bar",
    basePriceUsd: 2.0,
    visibleBranchKeys: ["bkk1", "tk"],
    modifierGroupNames: ["Add-ons"],
    baseComponents: [
      { stockItemName: "Espresso Beans", quantityInBaseUnit: 18, trackingMode: "TRACKED" },
      { stockItemName: "Hot Cup 12oz", quantityInBaseUnit: 1, trackingMode: "TRACKED" },
      { stockItemName: "Cup Lid", quantityInBaseUnit: 1, trackingMode: "TRACKED" },
    ],
  },
  {
    name: "Americano",
    categoryName: "Espresso Bar",
    basePriceUsd: 2.75,
    visibleBranchKeys: ["bkk1", "tk"],
    modifierGroupNames: ["Size", "Ice Level", "Add-ons"],
    baseComponents: [
      { stockItemName: "Espresso Beans", quantityInBaseUnit: 18, trackingMode: "TRACKED" },
      { stockItemName: "Hot Cup 12oz", quantityInBaseUnit: 1, trackingMode: "TRACKED" },
      { stockItemName: "Cup Lid", quantityInBaseUnit: 1, trackingMode: "TRACKED" },
    ],
  },
  {
    name: "Latte",
    categoryName: "Espresso Bar",
    basePriceUsd: 3.5,
    visibleBranchKeys: ["bkk1", "tk"],
    modifierGroupNames: ["Size", "Milk Choice", "Ice Level", "Add-ons"],
    baseComponents: [
      { stockItemName: "Espresso Beans", quantityInBaseUnit: 18, trackingMode: "TRACKED" },
      { stockItemName: "Whole Milk", quantityInBaseUnit: 180, trackingMode: "TRACKED" },
      { stockItemName: "Hot Cup 12oz", quantityInBaseUnit: 1, trackingMode: "TRACKED" },
      { stockItemName: "Cup Lid", quantityInBaseUnit: 1, trackingMode: "TRACKED" },
    ],
  },
  {
    name: "Cappuccino",
    categoryName: "Espresso Bar",
    basePriceUsd: 3.75,
    visibleBranchKeys: ["bkk1", "tk"],
    modifierGroupNames: ["Size", "Milk Choice", "Add-ons"],
    baseComponents: [
      { stockItemName: "Espresso Beans", quantityInBaseUnit: 18, trackingMode: "TRACKED" },
      { stockItemName: "Whole Milk", quantityInBaseUnit: 150, trackingMode: "TRACKED" },
      { stockItemName: "Hot Cup 12oz", quantityInBaseUnit: 1, trackingMode: "TRACKED" },
      { stockItemName: "Cup Lid", quantityInBaseUnit: 1, trackingMode: "TRACKED" },
    ],
  },
  {
    name: "Iced Lemon Tea",
    categoryName: "Tea & Signature",
    basePriceUsd: 2.5,
    visibleBranchKeys: ["bkk1", "tk"],
    modifierGroupNames: ["Size", "Ice Level"],
    baseComponents: [
      { stockItemName: "Tea Leaves", quantityInBaseUnit: 12, trackingMode: "TRACKED" },
      { stockItemName: "Cold Cup 16oz", quantityInBaseUnit: 1, trackingMode: "TRACKED" },
      { stockItemName: "Cup Lid", quantityInBaseUnit: 1, trackingMode: "TRACKED" },
    ],
  },
  {
    name: "Matcha Latte",
    categoryName: "Tea & Signature",
    basePriceUsd: 4.0,
    visibleBranchKeys: ["bkk1", "tk"],
    modifierGroupNames: ["Size", "Milk Choice", "Ice Level"],
    baseComponents: [
      { stockItemName: "Matcha Powder", quantityInBaseUnit: 20, trackingMode: "TRACKED" },
      { stockItemName: "Whole Milk", quantityInBaseUnit: 180, trackingMode: "TRACKED" },
      { stockItemName: "Hot Cup 12oz", quantityInBaseUnit: 1, trackingMode: "TRACKED" },
      { stockItemName: "Cup Lid", quantityInBaseUnit: 1, trackingMode: "TRACKED" },
    ],
  },
  {
    name: "Mocha",
    categoryName: "Tea & Signature",
    basePriceUsd: 4.25,
    visibleBranchKeys: ["bkk1", "tk"],
    modifierGroupNames: ["Size", "Milk Choice", "Add-ons"],
    baseComponents: [
      { stockItemName: "Espresso Beans", quantityInBaseUnit: 18, trackingMode: "TRACKED" },
      { stockItemName: "Whole Milk", quantityInBaseUnit: 180, trackingMode: "TRACKED" },
      { stockItemName: "Chocolate Syrup", quantityInBaseUnit: 25, trackingMode: "TRACKED" },
      { stockItemName: "Hot Cup 12oz", quantityInBaseUnit: 1, trackingMode: "TRACKED" },
      { stockItemName: "Cup Lid", quantityInBaseUnit: 1, trackingMode: "TRACKED" },
    ],
  },
  {
    name: "Coconut Coffee",
    categoryName: "Tea & Signature",
    basePriceUsd: 4.5,
    visibleBranchKeys: ["bkk1"],
    modifierGroupNames: ["Size", "Ice Level"],
    baseComponents: [
      { stockItemName: "Espresso Beans", quantityInBaseUnit: 18, trackingMode: "TRACKED" },
      { stockItemName: "Cold Cup 16oz", quantityInBaseUnit: 1, trackingMode: "TRACKED" },
      { stockItemName: "Cup Lid", quantityInBaseUnit: 1, trackingMode: "TRACKED" },
    ],
  },
  {
    name: "Butter Croissant",
    categoryName: "Bakery",
    basePriceUsd: 2.25,
    visibleBranchKeys: ["bkk1", "tk"],
    modifierGroupNames: [],
    baseComponents: [
      { stockItemName: "Croissant Piece", quantityInBaseUnit: 1, trackingMode: "TRACKED" },
      { stockItemName: "Paper Bag", quantityInBaseUnit: 1, trackingMode: "TRACKED" },
    ],
  },
  {
    name: "Banana Bread",
    categoryName: "Bakery",
    basePriceUsd: 2.75,
    visibleBranchKeys: ["bkk1", "tk"],
    modifierGroupNames: [],
    baseComponents: [
      { stockItemName: "Banana Bread Slice", quantityInBaseUnit: 1, trackingMode: "TRACKED" },
      { stockItemName: "Paper Bag", quantityInBaseUnit: 1, trackingMode: "TRACKED" },
    ],
  },
  {
    name: "Ham & Cheese Croissant",
    categoryName: "Bakery",
    basePriceUsd: 3.75,
    visibleBranchKeys: ["tk"],
    modifierGroupNames: [],
    baseComponents: [
      {
        stockItemName: "Ham & Cheese Croissant Piece",
        quantityInBaseUnit: 1,
        trackingMode: "TRACKED",
      },
      { stockItemName: "Paper Bag", quantityInBaseUnit: 1, trackingMode: "TRACKED" },
    ],
  },
] as const;

const INITIAL_STOCK: Record<BranchKey, Partial<Record<string, number>>> = {
  bkk1: {
    "Espresso Beans": 6000,
    "Tea Leaves": 2500,
    "Matcha Powder": 1200,
    "Whole Milk": 12000,
    "Oat Milk": 3500,
    "Chocolate Syrup": 1800,
    "Croissant Piece": 20,
    "Banana Bread Slice": 14,
    "Hot Cup 12oz": 180,
    "Cold Cup 16oz": 180,
    "Cup Lid": 260,
    "Paper Bag": 65,
  },
  tk: {
    "Espresso Beans": 4500,
    "Tea Leaves": 1800,
    "Matcha Powder": 800,
    "Whole Milk": 8000,
    "Oat Milk": 1500,
    "Chocolate Syrup": 1200,
    "Croissant Piece": 10,
    "Banana Bread Slice": 10,
    "Ham & Cheese Croissant Piece": 8,
    "Hot Cup 12oz": 120,
    "Cold Cup 16oz": 120,
    "Cup Lid": 160,
    "Paper Bag": 18,
  },
};

const ADJUSTMENTS: ReadonlyArray<{
  branchKey: BranchKey;
  stockItemName: string;
  deltaInBaseUnit: number;
  reasonCode: "ADJUSTMENT";
  note: string;
}> = [
  {
    branchKey: "bkk1",
    stockItemName: "Paper Bag",
    deltaInBaseUnit: -5,
    reasonCode: "ADJUSTMENT",
    note: "damaged packaging removed",
  },
  {
    branchKey: "tk",
    stockItemName: "Oat Milk",
    deltaInBaseUnit: -300,
    reasonCode: "ADJUSTMENT",
    note: "stock count correction",
  },
  {
    branchKey: "tk",
    stockItemName: "Ham & Cheese Croissant Piece",
    deltaInBaseUnit: -3,
    reasonCode: "ADJUSTMENT",
    note: "kitchen spoilage write-off",
  },
] as const;

const SHIFT_PATTERNS = [
  {
    membershipKey: "mgr_bkk1",
    branchKey: "bkk1",
    daysOfWeek: [1, 2, 3, 4, 5, 6],
    plannedStartTime: "07:00",
    plannedEndTime: "16:00",
    note: "branch manager standard shift",
  },
  {
    membershipKey: "cashier_bkk1_a",
    branchKey: "bkk1",
    daysOfWeek: [1, 2, 3, 4, 5],
    plannedStartTime: "06:30",
    plannedEndTime: "14:30",
    note: "morning cashier",
  },
  {
    membershipKey: "cashier_bkk1_b",
    branchKey: "bkk1",
    daysOfWeek: [1, 2, 3, 4, 5],
    plannedStartTime: "11:30",
    plannedEndTime: "19:30",
    note: "closing cashier weekdays",
  },
  {
    membershipKey: "cashier_bkk1_b",
    branchKey: "bkk1",
    daysOfWeek: [6, 0],
    plannedStartTime: "12:00",
    plannedEndTime: "20:00",
    note: "weekend closing cashier",
  },
  {
    membershipKey: "clerk_bkk1",
    branchKey: "bkk1",
    daysOfWeek: [1, 2, 3, 4, 5, 6],
    plannedStartTime: "08:00",
    plannedEndTime: "16:00",
    note: "support and stock prep",
  },
  {
    membershipKey: "mgr_tk",
    branchKey: "tk",
    daysOfWeek: [1, 2, 3, 4, 5, 6],
    plannedStartTime: "07:30",
    plannedEndTime: "16:30",
    note: "branch manager standard shift",
  },
  {
    membershipKey: "cashier_tk_a",
    branchKey: "tk",
    daysOfWeek: [1, 2, 3, 4, 5],
    plannedStartTime: "06:30",
    plannedEndTime: "14:30",
    note: "morning cashier",
  },
  {
    membershipKey: "cashier_tk_b",
    branchKey: "tk",
    daysOfWeek: [3, 4, 5, 6, 0],
    plannedStartTime: "11:30",
    plannedEndTime: "19:30",
    note: "closing cashier",
  },
  {
    membershipKey: "clerk_tk",
    branchKey: "tk",
    daysOfWeek: [1, 2, 3, 4, 5, 6],
    plannedStartTime: "08:00",
    plannedEndTime: "16:00",
    note: "support and stock prep",
  },
] as const;

async function seedCafeDemo(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      `DATABASE_URL is required to seed demo data. Add it to ${expectedLocalEnvFile}.`
    );
  }

  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await resetExistingDemoData(client);

    const passwordHash = await V0PasswordService.hashPassword(DEMO_PASSWORD);
    const tenantId = await insertTenant(client);
    const branchIds = await insertBranches(client, tenantId);

    await seedTenantDefaults(client, tenantId, branchIds);

    const accountIds = await insertAccounts(client, passwordHash);
    const membershipIds = await insertMemberships(client, tenantId, accountIds);
    await insertStaffProfiles(client, tenantId, accountIds, membershipIds);
    await insertBranchAssignments(client, tenantId, branchIds, accountIds, membershipIds);

    const menuCategoryIds = await insertMenuCategories(client, tenantId);
    const inventoryCategoryIds = await insertInventoryCategories(client, tenantId);
    const stockItemIds = await insertInventoryItems(client, tenantId, inventoryCategoryIds);
    const modifierIds = await insertModifierGroupsAndOptions(client, tenantId);
    await insertMenuCatalog(client, tenantId, branchIds, menuCategoryIds, stockItemIds, modifierIds);
    await insertModifierComponentDeltas(client, tenantId, stockItemIds, modifierIds);
    await seedInventoryState(client, tenantId, branchIds, stockItemIds, accountIds.owner);
    await seedShiftData(client, tenantId, branchIds, accountIds.owner, membershipIds);

    await client.query("COMMIT");

    console.log("🌱 Cafe demo seed completed successfully");
    console.log(`Tenant: ${DEMO_TENANT_NAME}`);
    console.log(`Password for all demo accounts: ${DEMO_PASSWORD}`);
    console.table(
      ACCOUNTS.map((account) => ({
        role: account.role,
        name: `${account.firstName} ${account.lastName}`,
        phone: account.phone,
        branches: account.branchKeys.join(", "),
      }))
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function resetExistingDemoData(client: PoolClient): Promise<void> {
  await client.query(`DELETE FROM tenants WHERE name = $1`, [DEMO_TENANT_NAME]);
  await client.query(`DELETE FROM accounts WHERE phone = ANY($1::VARCHAR[])`, [
    ACCOUNTS.map((account) => account.phone),
  ]);
}

async function insertTenant(client: PoolClient): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO tenants (name, status, address, contact_phone)
     VALUES ($1, 'ACTIVE', $2, $3)
     RETURNING id`,
    [DEMO_TENANT_NAME, "Phnom Penh", "+85510200000"]
  );
  return result.rows[0].id;
}

async function seedTenantDefaults(
  client: PoolClient,
  tenantId: string,
  branchIds: Record<BranchKey, string>
): Promise<void> {
  await client.query(
    `INSERT INTO v0_tenant_subscription_states (tenant_id, state)
     VALUES ($1, 'ACTIVE')`,
    [tenantId]
  );

  for (const branchId of Object.values(branchIds)) {
    await client.query(
      `UPDATE v0_branch_policies
       SET sale_allow_pay_later = TRUE,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND branch_id = $2`,
      [tenantId, branchId]
    );
  }

  for (const branchId of Object.values(branchIds)) {
    await client.query(
      `INSERT INTO v0_branch_entitlements (
         tenant_id,
         branch_id,
         entitlement_key,
         enforcement
       )
       VALUES
         ($1, $2, 'core.pos', 'ENABLED'),
         ($1, $2, 'module.workforce', 'ENABLED'),
         ($1, $2, 'module.inventory', 'ENABLED'),
         ($1, $2, 'addon.workforce.gps_verification', 'DISABLED_VISIBLE')`,
      [tenantId, branchId]
    );
  }
}

async function insertBranches(
  client: PoolClient,
  tenantId: string
): Promise<Record<BranchKey, string>> {
  const branchIds = {} as Record<BranchKey, string>;

  for (const branch of BRANCHES) {
    const result = await client.query<{ id: string }>(
      `INSERT INTO branches (
         tenant_id,
         name,
         status,
         address,
         contact_phone,
         khqr_receiver_account_id,
         khqr_receiver_name
       )
       VALUES ($1, $2, 'ACTIVE', $3, $4, $5, $6)
       RETURNING id`,
      [
        tenantId,
        branch.name,
        branch.address,
        branch.contactPhone,
        branch.khqrReceiverAccountId,
        branch.khqrReceiverName,
      ]
    );
    branchIds[branch.key] = result.rows[0].id;
  }

  return branchIds;
}

async function insertAccounts(
  client: PoolClient,
  passwordHash: string
): Promise<Record<string, string>> {
  const accountIds: Record<string, string> = {};

  for (const account of ACCOUNTS) {
    const result = await client.query<{ id: string }>(
      `INSERT INTO accounts (
         phone,
         password_hash,
         status,
         phone_verified_at,
         first_name,
         last_name
       )
       VALUES ($1, $2, 'ACTIVE', NOW(), $3, $4)
       RETURNING id`,
      [account.phone, passwordHash, account.firstName, account.lastName]
    );
    accountIds[account.key] = result.rows[0].id;
  }

  return accountIds;
}

async function insertMemberships(
  client: PoolClient,
  tenantId: string,
  accountIds: Record<string, string>
): Promise<Record<string, string>> {
  const membershipIds: Record<string, string> = {};
  let ownerMembershipId: string | null = null;

  for (const account of ACCOUNTS) {
    const membershipInsertResult: { rows: Array<{ id: string }> } = await client.query<{
      id: string;
    }>(
      `INSERT INTO v0_tenant_memberships (
         tenant_id,
         account_id,
         role_key,
         status,
         invited_by_membership_id,
         invited_at,
         accepted_at
       )
       VALUES ($1, $2, $3, 'ACTIVE', $4, NOW(), NOW())
       RETURNING id`,
      [
        tenantId,
        accountIds[account.key],
        account.role,
        account.role === "OWNER" ? null : ownerMembershipId,
      ]
    );
    membershipIds[account.key] = membershipInsertResult.rows[0].id;
    if (account.role === "OWNER") {
      ownerMembershipId = membershipInsertResult.rows[0].id;
    }
  }

  return membershipIds;
}

async function insertStaffProfiles(
  client: PoolClient,
  tenantId: string,
  accountIds: Record<string, string>,
  membershipIds: Record<string, string>
): Promise<void> {
  for (const account of ACCOUNTS) {
    if (!account.createStaffProfile) {
      continue;
    }

    await client.query(
      `INSERT INTO v0_staff_profiles (
         tenant_id,
         account_id,
         membership_id,
         first_name,
         last_name,
         status
       )
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE')`,
      [
        tenantId,
        accountIds[account.key],
        membershipIds[account.key],
        account.firstName,
        account.lastName,
      ]
    );
  }
}

async function insertBranchAssignments(
  client: PoolClient,
  tenantId: string,
  branchIds: Record<BranchKey, string>,
  accountIds: Record<string, string>,
  membershipIds: Record<string, string>
): Promise<void> {
  for (const account of ACCOUNTS) {
    for (const branchKey of account.branchKeys) {
      await client.query(
        `INSERT INTO v0_branch_assignments (
           tenant_id,
           branch_id,
           account_id,
           membership_id,
           status,
           assigned_at
         )
         VALUES ($1, $2, $3, $4, 'ACTIVE', NOW())`,
        [tenantId, branchIds[branchKey], accountIds[account.key], membershipIds[account.key]]
      );
    }
  }
}

async function insertMenuCategories(
  client: PoolClient,
  tenantId: string
): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const name of MENU_CATEGORIES) {
    const result = await client.query<{ id: string }>(
      `INSERT INTO v0_menu_categories (tenant_id, name, status)
       VALUES ($1, $2, 'ACTIVE')
       RETURNING id`,
      [tenantId, name]
    );
    ids[name] = result.rows[0].id;
  }
  return ids;
}

async function insertInventoryCategories(
  client: PoolClient,
  tenantId: string
): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const name of INVENTORY_CATEGORIES) {
    const result = await client.query<{ id: string }>(
      `INSERT INTO v0_inventory_stock_categories (tenant_id, name, status)
       VALUES ($1, $2, 'ACTIVE')
       RETURNING id`,
      [tenantId, name]
    );
    ids[name] = result.rows[0].id;
  }
  return ids;
}

async function insertInventoryItems(
  client: PoolClient,
  tenantId: string,
  inventoryCategoryIds: Record<string, string>
): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const item of INVENTORY_ITEMS) {
    const result = await client.query<{ id: string }>(
      `INSERT INTO v0_inventory_stock_items (
         tenant_id,
         category_id,
         name,
         base_unit,
         image_url,
         low_stock_threshold,
         status
       )
       VALUES ($1, $2, $3, $4, NULL, $5, 'ACTIVE')
       RETURNING id`,
      [
        tenantId,
        inventoryCategoryIds[item.categoryName],
        item.name,
        item.baseUnit,
        item.lowStockThreshold,
      ]
    );
    ids[item.name] = result.rows[0].id;
  }
  return ids;
}

async function insertModifierGroupsAndOptions(
  client: PoolClient,
  tenantId: string
): Promise<Record<string, { id: string; options: Record<string, string> }>> {
  const ids: Record<string, { id: string; options: Record<string, string> }> = {};

  for (const group of MODIFIER_GROUPS) {
    const groupResult = await client.query<{ id: string }>(
      `INSERT INTO v0_menu_modifier_groups (
         tenant_id,
         name,
         selection_mode,
         min_selections,
         max_selections,
         is_required,
         status
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
       RETURNING id`,
      [
        tenantId,
        group.name,
        group.selectionMode,
        group.minSelections,
        group.maxSelections,
        group.isRequired,
      ]
    );

    const optionIds: Record<string, string> = {};
    for (const option of group.options) {
      const optionResult = await client.query<{ id: string }>(
        `INSERT INTO v0_menu_modifier_options (
           tenant_id,
           modifier_group_id,
           label,
           price_delta,
           status
         )
         VALUES ($1, $2, $3, $4, 'ACTIVE')
         RETURNING id`,
        [tenantId, groupResult.rows[0].id, option.label, option.priceDelta]
      );
      optionIds[option.label] = optionResult.rows[0].id;
    }

    ids[group.name] = {
      id: groupResult.rows[0].id,
      options: optionIds,
    };
  }

  return ids;
}

async function insertMenuCatalog(
  client: PoolClient,
  tenantId: string,
  branchIds: Record<BranchKey, string>,
  menuCategoryIds: Record<string, string>,
  stockItemIds: Record<string, string>,
  modifierIds: Record<string, { id: string; options: Record<string, string> }>
): Promise<void> {
  for (const item of MENU_ITEMS) {
    const result = await client.query<{ id: string }>(
      `INSERT INTO v0_menu_items (
         tenant_id,
         name,
         base_price,
         category_id,
         status,
         image_url
       )
       VALUES ($1, $2, $3, $4, 'ACTIVE', NULL)
       RETURNING id`,
      [tenantId, item.name, item.basePriceUsd, menuCategoryIds[item.categoryName]]
    );
    const menuItemId = result.rows[0].id;

    for (const branchKey of item.visibleBranchKeys) {
      await client.query(
        `INSERT INTO v0_menu_item_branch_visibility (
           tenant_id,
           menu_item_id,
           branch_id
         )
         VALUES ($1, $2, $3)`,
        [tenantId, menuItemId, branchIds[branchKey]]
      );
    }

    for (const [displayOrder, groupName] of item.modifierGroupNames.entries()) {
      await client.query(
        `INSERT INTO v0_menu_item_modifier_group_links (
           tenant_id,
           menu_item_id,
           modifier_group_id,
           display_order
         )
         VALUES ($1, $2, $3, $4)`,
        [tenantId, menuItemId, modifierIds[groupName].id, displayOrder]
      );
    }

    for (const component of item.baseComponents) {
      await client.query(
        `INSERT INTO v0_menu_item_base_components (
           tenant_id,
           menu_item_id,
           stock_item_id,
           quantity_in_base_unit,
           tracking_mode
         )
         VALUES ($1, $2, $3, $4, $5)`,
        [
          tenantId,
          menuItemId,
          stockItemIds[component.stockItemName],
          component.quantityInBaseUnit,
          component.trackingMode,
        ]
      );
    }
  }
}

async function insertModifierComponentDeltas(
  client: PoolClient,
  tenantId: string,
  stockItemIds: Record<string, string>,
  modifierIds: Record<string, { id: string; options: Record<string, string> }>
): Promise<void> {
  const oatMilkOptionId = modifierIds["Milk Choice"].options["Oat Milk"];
  const extraShotOptionId = modifierIds["Add-ons"].options["Extra Shot"];

  await client.query(
    `INSERT INTO v0_menu_modifier_option_component_deltas (
       tenant_id,
       modifier_option_id,
       stock_item_id,
       quantity_delta_in_base_unit,
       tracking_mode
     )
     VALUES
       ($1, $2, $3, $4, 'TRACKED'),
       ($1, $2, $5, $6, 'TRACKED'),
       ($1, $7, $8, $9, 'TRACKED')`,
    [
      tenantId,
      oatMilkOptionId,
      stockItemIds["Whole Milk"],
      -180,
      stockItemIds["Oat Milk"],
      180,
      extraShotOptionId,
      stockItemIds["Espresso Beans"],
      18,
    ]
  );
}

async function seedInventoryState(
  client: PoolClient,
  tenantId: string,
  branchIds: Record<BranchKey, string>,
  stockItemIds: Record<string, string>,
  actorAccountId: string
): Promise<void> {
  const restockBaseDate = daysAgo(21);
  let movementIndex = 0;

  for (const [branchKey, items] of Object.entries(INITIAL_STOCK) as Array<
    [BranchKey, Partial<Record<string, number>>]
  >) {
    for (const [stockItemName, quantity] of Object.entries(items)) {
      if (!quantity || quantity <= 0) {
        continue;
      }
      const receivedAt = addDays(restockBaseDate, movementIndex);
      await recordRestockMovement(client, {
        tenantId,
        branchId: branchIds[branchKey],
        stockItemId: stockItemIds[stockItemName],
        quantityInBaseUnit: quantity,
        receivedAt,
        supplierName: supplierForStockItem(stockItemName),
        purchaseCostUsd: purchaseCostForSeed(stockItemName, quantity),
        note: `seed opening stock for ${stockItemName}`,
        actorAccountId,
        idempotencyKey: `seed-restock:${branchKey}:${toSeedKey(stockItemName)}`,
      });
      movementIndex += 1;
    }
  }

  for (const [index, adjustment] of ADJUSTMENTS.entries()) {
    await recordAdjustmentMovement(client, {
      tenantId,
      branchId: branchIds[adjustment.branchKey],
      stockItemId: stockItemIds[adjustment.stockItemName],
      deltaInBaseUnit: adjustment.deltaInBaseUnit,
      occurredAt: addDays(daysAgo(5), index),
      note: adjustment.note,
      actorAccountId,
      idempotencyKey: `seed-adjustment:${adjustment.branchKey}:${toSeedKey(adjustment.stockItemName)}`,
    });
  }
}

async function recordRestockMovement(
  client: PoolClient,
  input: {
    tenantId: string;
    branchId: string;
    stockItemId: string;
    quantityInBaseUnit: number;
    receivedAt: Date;
    supplierName: string;
    purchaseCostUsd: number;
    note: string;
    actorAccountId: string;
    idempotencyKey: string;
  }
): Promise<void> {
  const batchResult = await client.query<{ id: string }>(
    `INSERT INTO v0_inventory_restock_batches (
       tenant_id,
       branch_id,
       stock_item_id,
       quantity_in_base_unit,
       status,
       received_at,
       supplier_name,
       purchase_cost_usd,
       note,
       created_by_account_id
     )
     VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      input.tenantId,
      input.branchId,
      input.stockItemId,
      input.quantityInBaseUnit,
      input.receivedAt.toISOString(),
      input.supplierName,
      input.purchaseCostUsd,
      input.note,
      input.actorAccountId,
    ]
  );

  await client.query(
    `INSERT INTO v0_inventory_journal_entries (
       tenant_id,
       branch_id,
       stock_item_id,
       direction,
       quantity_in_base_unit,
       reason_code,
       source_type,
       source_id,
       idempotency_key,
       occurred_at,
       actor_account_id,
       note
     )
     VALUES ($1, $2, $3, 'IN', $4, 'RESTOCK', 'RESTOCK_BATCH', $5, $6, $7, $8, $9)`,
    [
      input.tenantId,
      input.branchId,
      input.stockItemId,
      input.quantityInBaseUnit,
      batchResult.rows[0].id,
      input.idempotencyKey,
      input.receivedAt.toISOString(),
      input.actorAccountId,
      input.note,
    ]
  );

  await applyBranchStockDelta(client, {
    tenantId: input.tenantId,
    branchId: input.branchId,
    stockItemId: input.stockItemId,
    deltaInBaseUnit: input.quantityInBaseUnit,
    occurredAt: input.receivedAt,
  });
}

async function recordAdjustmentMovement(
  client: PoolClient,
  input: {
    tenantId: string;
    branchId: string;
    stockItemId: string;
    deltaInBaseUnit: number;
    occurredAt: Date;
    note: string;
    actorAccountId: string;
    idempotencyKey: string;
  }
): Promise<void> {
  const quantity = Math.abs(input.deltaInBaseUnit);
  const direction = input.deltaInBaseUnit >= 0 ? "IN" : "OUT";
  const sourceId = `${input.idempotencyKey}:source`;

  await client.query(
    `INSERT INTO v0_inventory_journal_entries (
       tenant_id,
       branch_id,
       stock_item_id,
       direction,
       quantity_in_base_unit,
       reason_code,
       source_type,
       source_id,
       idempotency_key,
       occurred_at,
       actor_account_id,
       note
     )
     VALUES ($1, $2, $3, $4, $5, 'ADJUSTMENT', 'ADJUSTMENT', $6, $7, $8, $9, $10)`,
    [
      input.tenantId,
      input.branchId,
      input.stockItemId,
      direction,
      quantity,
      sourceId,
      input.idempotencyKey,
      input.occurredAt.toISOString(),
      input.actorAccountId,
      input.note,
    ]
  );

  await applyBranchStockDelta(client, {
    tenantId: input.tenantId,
    branchId: input.branchId,
    stockItemId: input.stockItemId,
    deltaInBaseUnit: input.deltaInBaseUnit,
    occurredAt: input.occurredAt,
  });
}

async function applyBranchStockDelta(
  client: PoolClient,
  input: {
    tenantId: string;
    branchId: string;
    stockItemId: string;
    deltaInBaseUnit: number;
    occurredAt: Date;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO v0_inventory_branch_stock (
       tenant_id,
       branch_id,
       stock_item_id,
       on_hand_in_base_unit,
       last_movement_at
     )
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tenant_id, branch_id, stock_item_id)
     DO UPDATE SET
       on_hand_in_base_unit =
         v0_inventory_branch_stock.on_hand_in_base_unit + EXCLUDED.on_hand_in_base_unit,
       last_movement_at =
         GREATEST(v0_inventory_branch_stock.last_movement_at, EXCLUDED.last_movement_at),
       updated_at = NOW()`,
    [
      input.tenantId,
      input.branchId,
      input.stockItemId,
      input.deltaInBaseUnit,
      input.occurredAt.toISOString(),
    ]
  );
}

async function seedShiftData(
  client: PoolClient,
  tenantId: string,
  branchIds: Record<BranchKey, string>,
  actorAccountId: string,
  membershipIds: Record<string, string>
): Promise<void> {
  const effectiveFrom = formatDate(startOfWeekMonday(new Date()));
  const patternIds: Record<string, string> = {};

  for (const pattern of SHIFT_PATTERNS) {
    const result = await client.query<{ id: string }>(
      `INSERT INTO v0_shift_patterns (
         tenant_id,
         membership_id,
         branch_id,
         days_of_week,
         planned_start_time,
         planned_end_time,
         effective_from,
         effective_to,
         status,
         note,
         created_by_account_id,
         updated_by_account_id
       )
       VALUES ($1, $2, $3, $4::SMALLINT[], $5::TIME, $6::TIME, $7::DATE, NULL, 'ACTIVE', $8, $9, $9)
       RETURNING id`,
      [
        tenantId,
        membershipIds[pattern.membershipKey],
        branchIds[pattern.branchKey],
        pattern.daysOfWeek,
        pattern.plannedStartTime,
        pattern.plannedEndTime,
        effectiveFrom,
        pattern.note,
        actorAccountId,
      ]
    );
    patternIds[`${pattern.membershipKey}:${pattern.note}`] = result.rows[0].id;
  }

  await insertShiftInstance(client, {
    tenantId,
    membershipId: membershipIds.clerk_bkk1,
    branchId: branchIds.bkk1,
    patternId: null,
    date: formatDate(nextWeekday(new Date(), 6)),
    plannedStartTime: "10:00",
    plannedEndTime: "14:00",
    status: "PLANNED",
    note: "latte art workshop support",
    cancelledReason: null,
    actorAccountId,
  });

  await insertShiftInstance(client, {
    tenantId,
    membershipId: membershipIds.cashier_tk_b,
    branchId: branchIds.tk,
    patternId: patternIds["cashier_tk_b:closing cashier"],
    date: formatDate(nextWeekday(new Date(), 0)),
    plannedStartTime: "13:00",
    plannedEndTime: "18:00",
    status: "UPDATED",
    note: "updated by manager for weekend coverage",
    cancelledReason: null,
    actorAccountId,
  });

  await insertShiftInstance(client, {
    tenantId,
    membershipId: membershipIds.cashier_tk_a,
    branchId: branchIds.tk,
    patternId: patternIds["cashier_tk_a:morning cashier"],
    date: formatDate(nextWeekday(new Date(), 1)),
    plannedStartTime: "09:00",
    plannedEndTime: "13:00",
    status: "CANCELLED",
    note: "staff day off approved",
    cancelledReason: "staff day off approved",
    actorAccountId,
  });
}

async function insertShiftInstance(
  client: PoolClient,
  input: {
    tenantId: string;
    membershipId: string;
    branchId: string;
    patternId: string | null;
    date: string;
    plannedStartTime: string;
    plannedEndTime: string;
    status: "PLANNED" | "UPDATED" | "CANCELLED";
    note: string | null;
    cancelledReason: string | null;
    actorAccountId: string;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO v0_shift_instances (
       tenant_id,
       membership_id,
       branch_id,
       pattern_id,
       shift_date,
       planned_start_time,
       planned_end_time,
       status,
       note,
       cancelled_reason,
       created_by_account_id,
       updated_by_account_id,
       cancelled_at
     )
     VALUES (
       $1,
       $2,
       $3,
       $4,
       $5::DATE,
       $6::TIME,
       $7::TIME,
       $8,
       $9,
       $10,
       $11,
       $11,
       CASE WHEN $8 = 'CANCELLED' THEN NOW() ELSE NULL END
     )`,
    [
      input.tenantId,
      input.membershipId,
      input.branchId,
      input.patternId,
      input.date,
      input.plannedStartTime,
      input.plannedEndTime,
      input.status,
      input.note,
      input.cancelledReason,
      input.actorAccountId,
    ]
  );
}

function supplierForStockItem(stockItemName: string): string {
  if (
    stockItemName === "Espresso Beans" ||
    stockItemName === "Tea Leaves" ||
    stockItemName === "Matcha Powder"
  ) {
    return "Highland Roasters";
  }
  if (
    stockItemName === "Whole Milk" ||
    stockItemName === "Oat Milk" ||
    stockItemName === "Chocolate Syrup"
  ) {
    return "Mekong Dairy Supply";
  }
  if (
    stockItemName === "Croissant Piece" ||
    stockItemName === "Banana Bread Slice" ||
    stockItemName === "Ham & Cheese Croissant Piece"
  ) {
    return "Daily Bake Partner";
  }
  return "Phnom Print & Pack";
}

function purchaseCostForSeed(stockItemName: string, quantity: number): number {
  const unitCost = new Map<string, number>([
    ["Espresso Beans", 0.0105],
    ["Tea Leaves", 0.006],
    ["Matcha Powder", 0.02],
    ["Whole Milk", 0.003],
    ["Oat Milk", 0.008],
    ["Chocolate Syrup", 0.01],
    ["Croissant Piece", 0.6],
    ["Banana Bread Slice", 0.45],
    ["Ham & Cheese Croissant Piece", 1.2],
    ["Hot Cup 12oz", 0.05],
    ["Cold Cup 16oz", 0.06],
    ["Cup Lid", 0.03],
    ["Paper Bag", 0.04],
  ]);
  const cost = (unitCost.get(stockItemName) ?? 0.01) * quantity;
  return Number(cost.toFixed(2));
}

function daysAgo(days: number): Date {
  return addDays(new Date(), -days);
}

function addDays(base: Date, days: number): Date {
  const copy = new Date(base);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function startOfWeekMonday(date: Date): Date {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + diff);
  return copy;
}

function nextWeekday(base: Date, targetDay: number): Date {
  const copy = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  const current = copy.getUTCDay();
  let delta = targetDay - current;
  if (delta <= 0) {
    delta += 7;
  }
  copy.setUTCDate(copy.getUTCDate() + delta);
  return copy;
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toSeedKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

if (process.argv[1]?.includes("seed-demo-cafe")) {
  seedCafeDemo().catch((error) => {
    console.error("❌ Demo cafe seed failed:", error);
    process.exit(1);
  });
}

export { seedCafeDemo };
