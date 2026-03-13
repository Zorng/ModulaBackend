# Cafe Demo Seed Blueprint v0

Status: Planning artifact  
Scope: Realistic demo seed for `/v0` across OrgAccount, Menu, Inventory, KHQR, Staff Management, and Shift  
Purpose: Define one believable tenant that is rich enough for frontend demos, QA, and pilot onboarding without introducing noisy live-state data

## Seed Goal

Create one tenant that feels like a real small cafe chain:

- 1 tenant
- 2 active branches
- 1 owner/admin
- 2 branch managers
- 6 branch staff
- menu with branch-specific visibility
- inventory with low-stock and zero-stock states
- shift patterns plus a few ad-hoc instances
- branch KHQR receiver configuration

This seed is intentionally designed for:

- tenant-vs-branch context demos
- staff and shift screens
- menu management screens
- inventory aggregate vs branch stock screens
- checkout and KHQR demos

It intentionally avoids seeding live operational states such as:

- attendance records
- open cash sessions
- pending KHQR attempts
- stale unpaid orders

## Current Backend Constraints To Respect

The seed must fit current backend behavior:

1. Shift does not support overnight time ranges in one record.
2. Shift is same-day only (`plannedStartTime < plannedEndTime`).
3. Item visibility is tenant-managed and branch-filtered through `visibleBranchIds`.
4. Inventory on-hand endpoints only show stock positions that have had movement before.
5. KHQR receiver is configured per branch.

## Tenant

- Tenant name: `Mekong Brew Cafe`
- Business type: `CAFE`
- Status: `ACTIVE`

## Branches

### Branch A

- Branch name: `Mekong Brew BKK1`
- Address: `Street 51, BKK1, Phnom Penh`
- Contact phone: `+85510200001`
- KHQR receiver account id: `mekongbrew.bkk1@bkrt`
- KHQR receiver name: `Mekong Brew BKK1`

### Branch B

- Branch name: `Mekong Brew Toul Kork`
- Address: `Street 289, Toul Kork, Phnom Penh`
- Contact phone: `+85510200002`
- KHQR receiver account id: `mekongbrew.tk@bkrt`
- KHQR receiver name: `Mekong Brew Toul Kork`

## Accounts, Memberships, And Branch Assignments

### Owner / Admin

- Name: `Dara Sok`
- Phone: `+85510100001`
- Role: `OWNER`
- Assigned branches:
  - `Mekong Brew BKK1`
  - `Mekong Brew Toul Kork`

### Branch A Team

- Manager: `Sreyneang Chan`
  - Phone: `+85510100002`
  - Role: `MANAGER`
  - Assigned branches:
    - `Mekong Brew BKK1`

- Staff 1: `Vanna Lim`
  - Phone: `+85510100003`
  - Role: `CASHIER`
  - Assigned branches:
    - `Mekong Brew BKK1`

- Staff 2: `Sophea Kim`
  - Phone: `+85510100004`
  - Role: `CASHIER`
  - Assigned branches:
    - `Mekong Brew BKK1`

- Staff 3: `Lina Phan`
  - Phone: `+85510100005`
  - Role: `CLERK`
  - Assigned branches:
    - `Mekong Brew BKK1`

### Branch B Team

- Manager: `Piseth Ouk`
  - Phone: `+85510100006`
  - Role: `MANAGER`
  - Assigned branches:
    - `Mekong Brew Toul Kork`

- Staff 1: `Mony Roth`
  - Phone: `+85510100007`
  - Role: `CASHIER`
  - Assigned branches:
    - `Mekong Brew Toul Kork`

- Staff 2: `Chanra Dev`
  - Phone: `+85510100008`
  - Role: `CASHIER`
  - Assigned branches:
    - `Mekong Brew Toul Kork`

- Staff 3: `Davy Touch`
  - Phone: `+85510100009`
  - Role: `CLERK`
  - Assigned branches:
    - `Mekong Brew Toul Kork`

## Shift Patterns

All shift times stay same-day to match current backend support.

### Branch A Patterns

- `Sreyneang Chan`
  - Mon-Sat
  - `07:00` - `16:00`
  - note: `branch manager standard shift`

- `Vanna Lim`
  - Mon-Fri
  - `06:30` - `14:30`
  - note: `morning cashier`

- `Sophea Kim`
  - Mon-Fri
  - `11:30` - `19:30`
  - note: `closing cashier weekdays`

- `Sophea Kim`
  - Sat-Sun
  - `12:00` - `20:00`
  - note: `weekend closing cashier`

- `Lina Phan`
  - Mon-Sat
  - `08:00` - `16:00`
  - note: `support and stock prep`

### Branch B Patterns

- `Piseth Ouk`
  - Mon-Sat
  - `07:30` - `16:30`
  - note: `branch manager standard shift`

- `Mony Roth`
  - Mon-Fri
  - `06:30` - `14:30`
  - note: `morning cashier`

- `Chanra Dev`
  - Wed-Sun
  - `11:30` - `19:30`
  - note: `closing cashier`

- `Davy Touch`
  - Mon-Sat
  - `08:00` - `16:00`
  - note: `support and stock prep`

## Ad-hoc Shift Instances

Seed a few instances so instance CRUD screens have realistic rows:

1. `Lina Phan`
- Branch: `Mekong Brew BKK1`
- Date: next upcoming Saturday
- Time: `10:00` - `14:00`
- Status: `PLANNED`
- Note: `latte art workshop support`

2. `Chanra Dev`
- Branch: `Mekong Brew Toul Kork`
- Date: next upcoming Sunday
- Time: `13:00` - `18:00`
- Status: `UPDATED`
- Note: `updated by manager for weekend coverage`

3. `Mony Roth`
- Branch: `Mekong Brew Toul Kork`
- Date: next upcoming Monday
- Time: `09:00` - `13:00`
- Status: `CANCELLED`
- Note: `staff day off approved`

## Menu Categories

1. `Espresso Bar`
2. `Tea & Signature`
3. `Bakery`

## Modifier Groups

### Size

- Selection mode: `SINGLE`
- Required: `true`
- Min: `1`
- Max: `1`
- Options:
  - `Small` (`+0.00`)
  - `Regular` (`+0.50`)
  - `Large` (`+1.00`)

### Milk Choice

- Selection mode: `SINGLE`
- Required: `false`
- Min: `0`
- Max: `1`
- Options:
  - `Whole Milk` (`+0.00`)
  - `Oat Milk` (`+0.75`)

### Ice Level

- Selection mode: `SINGLE`
- Required: `false`
- Min: `0`
- Max: `1`
- Options:
  - `No Ice` (`+0.00`)
  - `Less Ice` (`+0.00`)
  - `Regular Ice` (`+0.00`)

### Add-ons

- Selection mode: `MULTI`
- Required: `false`
- Min: `0`
- Max: `2`
- Options:
  - `Extra Shot` (`+0.75`)
  - `Whipped Cream` (`+0.50`)

## Menu Items

### Espresso Bar

1. `Espresso`
- Base price USD: `2.00`
- Visible branches:
  - `Mekong Brew BKK1`
  - `Mekong Brew Toul Kork`
- Modifiers:
  - `Add-ons`

2. `Americano`
- Base price USD: `2.75`
- Visible branches:
  - both branches
- Modifiers:
  - `Size`
  - `Ice Level`
  - `Add-ons`

3. `Latte`
- Base price USD: `3.50`
- Visible branches:
  - both branches
- Modifiers:
  - `Size`
  - `Milk Choice`
  - `Ice Level`
  - `Add-ons`

4. `Cappuccino`
- Base price USD: `3.75`
- Visible branches:
  - both branches
- Modifiers:
  - `Size`
  - `Milk Choice`
  - `Add-ons`

### Tea & Signature

5. `Iced Lemon Tea`
- Base price USD: `2.50`
- Visible branches:
  - both branches
- Modifiers:
  - `Size`
  - `Ice Level`

6. `Matcha Latte`
- Base price USD: `4.00`
- Visible branches:
  - both branches
- Modifiers:
  - `Size`
  - `Milk Choice`
  - `Ice Level`

7. `Mocha`
- Base price USD: `4.25`
- Visible branches:
  - both branches
- Modifiers:
  - `Size`
  - `Milk Choice`
  - `Add-ons`

8. `Coconut Coffee`
- Base price USD: `4.50`
- Visible branches:
  - `Mekong Brew BKK1`
- Modifiers:
  - `Size`
  - `Ice Level`

### Bakery

9. `Butter Croissant`
- Base price USD: `2.25`
- Visible branches:
  - both branches

10. `Banana Bread`
- Base price USD: `2.75`
- Visible branches:
  - both branches

11. `Ham & Cheese Croissant`
- Base price USD: `3.75`
- Visible branches:
  - `Mekong Brew Toul Kork`

## Inventory Categories

1. `Coffee & Tea Base`
2. `Dairy & Syrups`
3. `Bakery Stock`
4. `Packaging`

## Inventory Stock Items

### Coffee & Tea Base

- `Espresso Beans`
  - base unit: `g`
  - low stock threshold: `1000`

- `Tea Leaves`
  - base unit: `g`
  - low stock threshold: `800`

- `Matcha Powder`
  - base unit: `g`
  - low stock threshold: `400`

### Dairy & Syrups

- `Whole Milk`
  - base unit: `ml`
  - low stock threshold: `3000`

- `Oat Milk`
  - base unit: `ml`
  - low stock threshold: `1500`

- `Chocolate Syrup`
  - base unit: `ml`
  - low stock threshold: `800`

### Bakery Stock

- `Croissant Piece`
  - base unit: `pcs`
  - low stock threshold: `10`

- `Banana Bread Slice`
  - base unit: `pcs`
  - low stock threshold: `8`

- `Ham & Cheese Croissant Piece`
  - base unit: `pcs`
  - low stock threshold: `6`

### Packaging

- `Hot Cup 12oz`
  - base unit: `pcs`
  - low stock threshold: `50`

- `Cold Cup 16oz`
  - base unit: `pcs`
  - low stock threshold: `50`

- `Cup Lid`
  - base unit: `pcs`
  - low stock threshold: `80`

- `Paper Bag`
  - base unit: `pcs`
  - low stock threshold: `20`

## Base Component Mapping

### Drinks

- `Espresso`
  - Espresso Beans: `18 g`
  - Hot Cup 12oz: `1 pcs`
  - Cup Lid: `1 pcs`

- `Americano`
  - Espresso Beans: `18 g`
  - Hot Cup 12oz: `1 pcs`
  - Cup Lid: `1 pcs`

- `Latte`
  - Espresso Beans: `18 g`
  - Whole Milk: `180 ml`
  - Hot Cup 12oz: `1 pcs`
  - Cup Lid: `1 pcs`

- `Cappuccino`
  - Espresso Beans: `18 g`
  - Whole Milk: `150 ml`
  - Hot Cup 12oz: `1 pcs`
  - Cup Lid: `1 pcs`

- `Iced Lemon Tea`
  - Tea Leaves: `12 g`
  - Cold Cup 16oz: `1 pcs`
  - Cup Lid: `1 pcs`

- `Matcha Latte`
  - Matcha Powder: `20 g`
  - Whole Milk: `180 ml`
  - Hot Cup 12oz: `1 pcs`
  - Cup Lid: `1 pcs`

- `Mocha`
  - Espresso Beans: `18 g`
  - Whole Milk: `180 ml`
  - Chocolate Syrup: `25 ml`
  - Hot Cup 12oz: `1 pcs`
  - Cup Lid: `1 pcs`

- `Coconut Coffee`
  - Espresso Beans: `18 g`
  - Cold Cup 16oz: `1 pcs`
  - Cup Lid: `1 pcs`

### Bakery

- `Butter Croissant`
  - Croissant Piece: `1 pcs`
  - Paper Bag: `1 pcs`

- `Banana Bread`
  - Banana Bread Slice: `1 pcs`
  - Paper Bag: `1 pcs`

- `Ham & Cheese Croissant`
  - Ham & Cheese Croissant Piece: `1 pcs`
  - Paper Bag: `1 pcs`

## Modifier Component Deltas

Only seed the component deltas that matter for inventory realism:

- `Oat Milk`
  - Whole Milk delta: `0`
  - Oat Milk delta: `180 ml`

- `Extra Shot`
  - Espresso Beans delta: `18 g`

This keeps the seed believable without overcomplicating component math.

## Initial Branch Stock

### Mekong Brew BKK1

- Espresso Beans: `6000 g`
- Tea Leaves: `2500 g`
- Matcha Powder: `1200 g`
- Whole Milk: `12000 ml`
- Oat Milk: `3500 ml`
- Chocolate Syrup: `1800 ml`
- Croissant Piece: `20 pcs`
- Banana Bread Slice: `14 pcs`
- Ham & Cheese Croissant Piece: `0 pcs`
- Hot Cup 12oz: `180 pcs`
- Cold Cup 16oz: `180 pcs`
- Cup Lid: `260 pcs`
- Paper Bag: `60 pcs`

### Mekong Brew Toul Kork

- Espresso Beans: `4500 g`
- Tea Leaves: `1800 g`
- Matcha Powder: `800 g`
- Whole Milk: `8000 ml`
- Oat Milk: `1200 ml`
- Chocolate Syrup: `1200 ml`
- Croissant Piece: `10 pcs`
- Banana Bread Slice: `10 pcs`
- Ham & Cheese Croissant Piece: `5 pcs`
- Hot Cup 12oz: `120 pcs`
- Cold Cup 16oz: `120 pcs`
- Cup Lid: `160 pcs`
- Paper Bag: `18 pcs`

Notes:

- `Ham & Cheese Croissant Piece` at BKK1 should remain unseen in stock projection until movement exists.
- BKK1 can still have the catalog item hidden by menu visibility, while inventory remains tenant-managed.
- Toul Kork intentionally has several low-stock signals:
  - Oat Milk
  - Ham & Cheese Croissant Piece
  - Paper Bag

## Restock History

Seed light history so the restock list and journal are useful:

### BKK1

1. Recent restock:
- Whole Milk
- `6000 ml`
- supplier: `Mekong Dairy Supply`
- purchase cost USD: `18.00`

2. Recent restock:
- Espresso Beans
- `3000 g`
- supplier: `Highland Roasters`
- purchase cost USD: `32.00`

3. Recent adjustment:
- Paper Bag
- `-5 pcs`
- reason: `ADJUSTMENT`
- note: `damaged packaging removed`

### Toul Kork

1. Recent restock:
- Whole Milk
- `4000 ml`
- supplier: `Mekong Dairy Supply`
- purchase cost USD: `12.50`

2. Recent restock:
- Ham & Cheese Croissant Piece
- `8 pcs`
- supplier: `Daily Bake Partner`
- purchase cost USD: `10.00`

3. Recent adjustment:
- Oat Milk
- `-300 ml`
- reason: `ADJUSTMENT`
- note: `stock count correction`

## Demo Scenarios This Seed Should Support

### Menu

- tenant-wide menu management
- branch-specific menu visibility
- modifier group and option display
- item image upload later if desired

### Inventory

- tenant aggregate stock page
- branch stock page by explicit `branchId`
- low-stock examples
- zero-stock but previously stocked example
- restock list and journal drill-down

### Staff / Shift

- list staff by tenant
- branch-specific assignments
- manager/team split by branch
- staff self-view of active shifts
- flexible multi-pattern schedule example
- ad-hoc planned/updated/cancelled instance rows

### POS / Sales

- branch-specific catalog
- inventory auto-deduction on tracked items
- KHQR receiver resolution by branch
- cash session occupancy and session sales list

## Recommended Review Questions Before Implementation

1. Are the branch names and cafe theme acceptable for demos?
2. Do we want all six staff to already be `ACTIVE`, or should one be `INVITED` for membership demo?
3. Should branch KHQR receiver accounts be real test accounts or placeholders for later manual patching?
4. Do we want more bakery-heavy stock for Toul Kork, or keep it drink-focused?
5. Do we want one stock item intentionally archived for UI testing, or keep all seeded catalog items active?
