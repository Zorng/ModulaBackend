Module Spec : Menu & Category Managemen t (Phase 1)  
Purpose & Scope  
Provide admins (and branch managers with limited rights) a way to define, organize, and 
maintain the café’s catalog —categories, items, and modifiers —with per -branch 
availability and (optional) price overrides. Must be fast, offline -ready, and enforce quota s 
to prevent resource exhaustion. Outputs a consistent, cached menu for the Sale Module.  
 
Actors & Permissions  
• Admin (tenant):  Full CRUD on categories, items, modifier groups/options; assign 
items to branches; set availability; set (optional) branch price overrides; reorder 
display; upload images; archive/deactivate; manage limits.  
• Manager (branch):  Update branch -level availability  and branch display order ; 
optional privilege to tweak branch custom price  if enabled by Admin; cannot 
create/delete items/categories; cannot upload images.  
• Cashier (branch):  View -only (menu used in sales); no edit rights.  
• System:  Syncs menu snapshots to device (IndexedDB), enforces quotas server -
side, logs audit events.  
User Stories (with acceptance criteria)  
1. Create Category (Admin)  
• I can create a category and control its display order.  
•    AC: Fields: name, optional description, display_order, active flag; category 
appears only in assigned branches; unique name per tenant; reorder persists.  
 
2. Add Menu Item (Admin)  
• I can add an item under a category and assign it to branches.  
•    AC: Fields: name, description, base price (USD), image (JPEG/WEBP ≤ 300 KB), 
active flag, category_id, assigned_branches[]; item visible to branch cashiers after 
sync.  
   
 
   
  
3. Define Modifiers (Admin)  
• I can attach reusable modifier groups to items (e.g., Size, Milk, Toppings).  
•    AC: Group selection type single/multi; each option has name and ±price 
adjustment; limits enforced (≤5 groups/item, ≤12 options/group, ≤30 options total 
across groups).  
 
4. Branch Availability & Pricing (Manager/Admin)  
• I can mark items unavailable for my branch; if allowed, set a branch custom price.  
•    AC: Toggling availability instantly hides/shows the item in that branch; branch 
price override (if enabled) is used at sale time; audit logged.  
5. Reorder Categories/Items (Admin/Manager)  
• I can reorder categories and items for how they display on POS.  
•    AC: Drag -drop order persists per branch; reflected after cache refresh; cashier 
sees new order on reload (or soft refresh signal).  
6. Offline Menu Access (Cashier)  
• I can use the menu while offline.  
•    AC: Device uses last synced snapshot from IndexedDB; when online, delta sync 
updates snapshot reliably.  
 
7. Quota Enforcement (System)  
• Prevent catalog bloat and abuse with soft/hard limits.  
•    AC: At soft limit → warning; at hard cap → reject with helpful error 
codes/messages; all enforced server -side.  
 
Functional Requirements  
• Category Management:  CRUD, active flag, per -branch visibility, order 
management.  
• Item Management:  CRUD, base price (USD), description, image upload 
(JPEG/WEBP ≤ 300 KB), category link, active flag, branch assignment.  
   
 
   
 • Modifiers:  CRUD groups/options; attach/detach to items; selection rules 
(single/multi); price adjustments apply before discount.  
• Branch Overrides:  Availability and optional custom price per branch (policy toggle).  
• Display Order:  Maintain per -branch ordering for categories and items.  
• Discount Awareness:  Items flagged as discounted (policy -driven) show badge in 
POS; calculation handled in Sale Module.  
• Sync & Cache:  On login, branch pulls menu snapshot to IndexedDB; background 
delta sync updates cache; version watermark maintained.  
• Quotas & Limits (Phase 1 defaults):  
o Menu items per tenant: soft 75  (warn at 70), hard 120  (reject).  
o Categories per tenant: soft 8  (warn at 7), hard 12  (reject).  
o Modifiers: ≤5 groups/item , ≤12 options/group , ≤30 options total per item . 
o Images: ≤300 KB , JPEG/WEBP ; tenant media quota 10 MB . 
o Count items once per tenant  (branch assignments don’t multiply counts).  
• Rate Limiting:  Menu CRUD writes limited (e.g., 30/min/tenant) to mitigate bursts.  
• Audit Logging:  All create/update/delete; limit exceed events; abnormal spikes.  
 
Non -Functional Requirements  
• Performance:  Menu load ≤ 2s for up to ~120 items with pagination/lazy -load; admin 
lists paginate.  
• Offline Continuity:  Full read from cache; edits queue until online (admin/manager 
edits typically done online).  
• Security:  Role -based authorization on every API; image uploads validated and 
scanned (basic).  
• Data Integrity:  Unique item names within a category  per tenant (case -insensitive); 
no deletion if referenced in sales —use deactivate.  
• Usability:  Clear counters (e.g., Items 72/75); inline limit indicators for modifiers; 
compress images client -side.  
• Reliability:  Delta sync idempotent; conflict resolution favors latest admin write 
with audit record.  
 
   
 
   
 Data Model Notes (minimum)  
• categories  
o id, tenant_id, name, description, display_order, is_active, timestamps  
• menu_items  
o id, tenant_id, category_id, name, description, price_usd, image_url, 
is_active, timestamps  
• modifiers  
o id, tenant_id, name, selection_type (single/multi), timestamps  
• modifier_options  
o id, modifier_id, name, price_adjustment_usd, is_active, timestamps  
• item_modifiers (junction)  
o id, menu_item_id, modifier_id  
• branch_menu_items  
o id, branch_id, menu_item_id, custom_price_usd (nullable), is_available 
(bool), display_order, timestamps  
• tenant_limits (config)  
o tenant_id, max_items_soft(75), max_items_hard(120), 
max_categories_soft(8), max_categories_hard(12),  
max_modifier_groups_per_item(5), max_options_per_group(12), 
max_total_options_per_item(30), media_quota_mb(10)  
• audit_log  
o id, `tenant_i d 
 
Usage Scenarios  
Scenario: First -time Menu Setup for a Café  
Context  
• A new tenant “Sunrise Café” just registered.  
• One branch: Main Branch . 
• The Admin wants to set up these drinks:  
o Cold : Iced Latte, Iced Americano  
o Juice : Orange Juice  
   
 
   
 o Hot : Hot Latte, Espresso, Hot Green Tea  
• Modifiers : 
o Cold drinks: Sugar Level  + Ice Level  
o Hot drinks: Sugar Level  only  
o Juice: No modifiers  
 
1) Create Categories  
Admin → Catalog → Categories → “Create”  
• Coffee (Cold)  — active, order #1  
• Coffee (Hot)  — active, order #2  
• Juice  — active, order #3  
• Assign all three categories to Main Branch . 
 
   Result: Cashier menu will show three tabs/sections in this order.  
 
2) Define Reusable Modifier Group  
Admin → Catalog → Modifiers → “Create Group”  
A) Sugar Level  (single -select)  
• Options (no price change):  
o No Sugar, Less Sugar, Normal Sugar, Extra Sugar  
 
B) Ice Level  (single -select)  
• Options (no price change):  
o No Ice, Less Ice, Normal Ice, Extra Ice  
 
Tip: Keep both groups reusable; you’ll attach them to multiple items.  
   
 
   
    Result: Two reusable groups ready to attach to items.  
 
3) Add Menu Items with Correct Modifiers  
A) Cold Coffee Items (attach Sugar + Ice)  
• Iced Latte  
o Category: Coffee (Cold)  
o Base Price: $2.50  
o Modifiers: Sugar Level , Ice Level  
o Branch assignment: Main Branch  
o Active    
• Iced Americano  
o Category: Coffee (Cold)  
o Base Price: $2.00  
o Modifiers: Sugar Level , Ice Level  
o Branch assignment: Main Branch  
o Active    
 
B) Juice (no modifiers)  
• Orange Juice  
o Category: Juice  
o Base Price: $2.25  
o Modifiers: (none)  
o Branch assignment: Main Branch  
o Active    
 
C) Hot Coffee Items (attach Sugar only)  
• Hot Latte  
o Category: Coffee (Hot)  
o Base Price: $2.50  
o Modifiers: Sugar Level  
   
 
   
 o Branch assignment: Main Branch  
o Active    
• Espresso  
o Category: Coffee (Hot)  
o Base Price: $1.75  
o Modifiers: (none or Sugar Level — up to café; here we’ll do none  for purity)  
o Branch assignment: Main Branch  
o Active    
• Hot Green Tea  
o Category: Coffee (Hot) (or “Tea (Hot)” if you prefer another category)  
o Base Price: $1.80  
o Modifiers: Sugar Level  
o Branch assignment: Main Branch  
o Active    
 
   Result: Items appear under their categories with the correct modifier sets. Nothing is 
duplicated; modifiers are reused.  
 
4) Set Display Order (Optional polish)  
 
Admin → Reorder  
• Coffee (Cold) first, then Coffee (Hot), then Juice.  
• Inside Coffee (Cold) : Iced Latte before Iced Americano.  
• Inside Coffee (Hot) : Hot Latte → Espresso → Hot Green Tea.  
 
   Result: Cashier sees a neat, predictable layout.  
 
   
 
   
 5) (Optional) Branch -Level Adjustments  
 
If the Admin wants to hide Espresso temporarily or tweak a branch price:  
• Manager/Admin → Branch Menu  
o Toggle Espresso: unavailable  
o Or set Iced Latte  custom price for Main Branch (e.g., $2.60).  
 
   Result: Only Main Branch is affected; global item stays unchanged.  
 
6) Offline Readiness  
When the Admin saves, the branch menu snapshot  (categories, items, modifiers) is 
synced to devices:  
• Cashier terminals cache everything in IndexedDB . 
• If the internet drops, the cashier still sees and sells from this menu.  
 
   Result: Reliable, offline -friendly menu from day one.  
 
What the Cashier Will Experience  
• On login, the Menu  shows:  
o Coffee (Cold):  Iced Latte, Iced Americano  
▪ Tapping either opens modifiers: Sugar Level  + Ice Level  
o Coffee (Hot):  Hot Latte (Sugar Level), Espresso (no modifiers), Hot Green 
Tea (Sugar Level)  
o Juice:  Orange Juice (no modifiers)  
• Adding Iced Latte  prompts:  
→ Sugar Level (No, Less, Normal, Extra) + Ice Level (No, Less, Normal, Extra)  
   
 
   
 • Adding Hot Latte  prompts:  
→ Sugar Level only  
• Orange Juice  adds straight to cart.  
•  
Everything calculates correctly (modifiers before discount/VAT), and discount badges (if 
any policy later) will appear on the menu automatically.  
Acceptance Checklist (quick)  
• Categories created and assigned to Main Branch . 
• Modifier groups created once and reused . 
• Cold items have Sugar + Ice ; Hot items have Sugar only  (except Espresso).  
• Juice item has no modifiers . 
• Items are active, assigned to Main Branch , and appear in the cashier menu.  
• Menu cached offline after first sync.  
Scenario: Adding “Bubble Milk Tea” with Toppings  
Context  
• Tenant: Sunrise Café  (Admin logged in)  
• Branch: Main Branch  
• Goal: Add Bubble Milk Tea  under Milk Tea  category with:  
o Sugar Level  (single -select)  
o Ice Level  (single -select)  
o Toppings  (multi -select; each topping adds extra cost)  
 
1) Create or Verify Category  
Admin → Catalog → Categories  
• If not present, click Create Category : 
o Name:  Milk Tea  
o Active:  Yes  
   
 
   
 o Display order:  After Coffee categories  
o Assigned branches:  Main Branch  
   Result: “Milk Tea” appears for this branch.  
 
2) Define/Reuse Modifier Groups  
Admin → Catalog → Modifiers  
 
A) Sugar Level  (single -select; reuse if already created)  
• Options (no price change): No, Less, Normal, Extra  
 
B) Ice Level  (single -select; reuse if already created)  
• Options (no price change): No, Less, Normal, Extra  
 
C) Toppings  (new group; multi -select)  
• Selection type:  Multiple  
• Options (+ price adj.):  
o Boba  (+$0.30)  
o Aloe Vera Jelly  (+$0.40)  
o Grass Jelly  (+$0.35)  
o Red Bean  (+$0.30)  
• (Stay within limits: ≤12 options/group, ≤5 groups/item total.)  
 
   Result: Three reusable groups ready; Toppings supports multiple selections with price 
add -ons.  
   
 
   
 3) Add the Menu Item  
Admin → Catalog → Items → Create Item  
• Name:  Bubble Milk Tea  
• Category:  Milk Tea  
• Base Price (USD):  $2.80  
• Modifiers attached:  Sugar Level (single), Ice Level (single), Toppings (multi)  
• Assigned branches:  Main Branch  
• Active:  Yes  
• (Optional) Image (JPEG/WEBP ≤ 300KB)  
 
   Result: Item saved, linked to modifiers, visible to Main Branch after sync.  
 
4) Display Order (Optional)  
Admin → Reorder  
• Put Bubble Milk Tea  at the top of the Milk Tea list.  
   Result: Cashiers see it first in the Milk Tea section.  
 
5) Offline Sync  
• On save, Modula pushes a menu snapshot  to devices.  
• Cashier terminals cache the updated category, item, and modifiers in IndexedDB . 
 
   Result: Even offline, “Bubble Milk Tea” and its options are available for sale.  
 
   
 
   
 What the Cashier Sees During a Sale  
 
Cashier → Menu → Milk Tea → Bubble Milk Tea  
• Prompts open:  
o Sugar Level:  No / Less / Normal / Extra (choose one)  
o Ice Level:  No / Less / Normal / Extra (choose one)  
o Toppings (multi -select):  Boba (+$0.30), Aloe Vera (+$0.40), Grass Jelly 
(+$0.35), Red Bean (+$0.30)  
 
Example build:  
• Sugar: Normal  
• Ice: Less  
• Toppings: Boba  and Aloe Vera  
 
Cart math:  
• Base price: $2.80  
o Boba $0.30  
o Aloe Vera $0.40  
• Line total:  $3.50  (before any discount/VAT)  
(If a branch or item discount policy exists, the Sale Module applies it automatically after 
modifiers.)  
Acceptance Checklist  
• Milk Tea  category exists, active, and assigned to Main Branch.  
• Bubble Milk Tea  created with $2.80  base price and attached to the three modifier 
groups.  
• Toppings  group is multi -select  with correct per -option price adjustments.  
• Item is visible to cashiers under Milk Tea , in the correct display order.  
• Item shows and works offline  after the menu snapshot sync.  
   
 
   
 • Choosing multiple toppings correctly increases the line price.  
 
Guardrails (quietly enforced)  
• Modifier limits: ≤5 groups/item, ≤12 options/group, ≤30 total options per item.  
• Image size/type validated (≤300KB, JPEG/WEBP).  
• Item counted once toward tenant quota (not multiplied by branches).

---

Menu & Category Module (Capstone 1 – Revised)  
Purpose & Scope  
 
Manage the creation, organization, and configuration of menu items and categories  for 
F&B tenants. Each menu item defines its name, price, availability, optional modifiers, and 
now — its inventory linkage  to a single stock item for automatic deduction when sales are 
finalized.  
 
This module connects the front -facing sales experience  with back -office inventory 
control , ensuring each sale can optionally adjust stock levels while maintaining flexibility 
for cafés, drink shops, and mixed F&B businesses.  
 
Actors & Permissions  
• Admin (tenant):  
o Full CRUD on categories and menu items.  
o Assign stock item mappings and quantity -per-sale.  
o Set prices, modifiers, visibility.  
• Manager (branch):  
o View categories and menu items for their branch.  
o Suggest edits or flag unavailable items (future enhancement).  
• Cashier:  
o Read -only; interacts only with visible items during checkout.  
 
Functional Overview  
 
1️⃣ Category Management  
• Create, edit, or delete categories (e.g., Coffee, Tea, Juice, Dessert).  
• Define display order for POS menus.  
• Limit: max 8 categories per tenant  (Capstone 1 safeguard).  
 
2️⃣ Menu Item Management  
• Create, edit, or deactivate items under a category.  
• Define:  
o name, price_usd, is_active, category_id  
o Optional description, image_url, tags  
o Modifiers  (e.g., sugar/ice level, toppings)  
o Inventory mapping (new):  select 1 stock item and define qty_per_sale  
o Discount flag:  shows if a discount policy applies  
• Limit: max 75 items per tenant  (Capstone 1 safeguard).  
 
3️⃣ Modifier Management  
• Create reusable modifier groups  (sugar level, size, toppings).  
• Each group has multiple options , each with:  
o label, price_delta, is_default  
• Assign modifiers to menu items.  
• Modifiers affect sale price  but not stock  in Capstone 1.  
 
Inventory Mapping (Capstone 1 integration)  
 
Each menu item can optionally be linked to one  stock item with a fixed quantity -per-sale  
(supports decimals).  
Example  Stock Item  Qty per Sale  Deduction Trigger  
Iced Latte  Cups 16oz  1 pcs  Finalize sale  
Orange Juice  Oranges  1 pcs  Finalize sale  
Hot Latte  — — None (no 
mapping)  
• On finalize, if Inventory Policy → Subtract on Finalize  is true, the system posts:  
delta = -(qty_per_sale × quantity_sold)  
into the inventory_journal  for that branch.  
• Voided or reopened sales post compensating entries.  
 
Validation:  
• qty_per_sale must be > 0 if stock_item_id is set.  
• Admin can remove mapping without affecting historical sales.  
 
User Stories & Acceptance Criteria  
 
US-M01 — Create Category  
• Admin defines a category (e.g., Coffee).  
•    Appears on POS interface for sorting items.  
 
US-M02 — Add Menu Item  
• Admin creates “Iced Latte” under Coffee.  
•    Fields: name, price, modifiers, optional inventory mapping.  
 
US-M03 — Configure Modifiers  
• Admin defines “Sugar Level” with options: Normal, Less, None.  
•    Cashier sees options when adding the item to order.  
 
US-M04 — Link Menu Item to Inventory  
• Admin links “Iced Latte” → “Cups 16oz” with qty_per_sale = 1.  
•    Sale of 3 Iced Lattes deducts 3 cups if policy ON.  
 
US-M05 — Deactivate Menu Item  
• Admin toggles is_active=false.  
•    Item disappears from POS.  
 
US-M06 — Enforce Item Limits  
• Tenant cannot exceed 75 items or 8 categories.  
•    API returns error code LIMIT_EXCEEDED.  
 
Functional Requirements  
• Categories and menu items are tenant -scoped . 
• Modifiers reusable across multiple items.  
• Inventory mapping stored separately (via menu_stock_map table).  
• Sale service references mapping to trigger deduction logic.  
• Discount visibility: read active policies to flag discounted items in the menu.  
 
Non -Functional Requirements  
• Performance:  load ≤300 ms for a full menu.  
• Usability:  mobile -first interface; easy search/filter.  
• Scalability:  extendable to multi -stock mapping in Phase 2.  
• Offline support:  cached menu in IndexedDB (read -only).  
• Security:  branch -filtered visibility; admin -only writes.  
 
Data Model (Capstone 1)  
• categories  
o id, tenant_id, name, display_order, is_active, created_at  
• menu_items  
o id, tenant_id, category_id, name, price_usd, image_url?, description?, 
is_active, created_by, created_at  
• modifiers  
o id, tenant_id, name, type('choice'|'multi'), created_at  
• modifier_options  
o id, modifier_id, label, price_delta_usd, is_default, created_at  
• menu_modifier_map  
o menu_item_id, modifier_id  
• menu_stock_map  (links to inventory)  
o menu_item_id (PK), stock_item_id, qty_per_sale  
• audit_log  (shared)  logs all CRUD operations.  
 
Example Scenario  
 
The Sunrise Café owner (Admin)  sets up the menu:  
1. Creates categories: Coffee, Milk Tea, Juice.  
2. Adds:  
a. Iced Latte  → Coffee → price $2.50 → maps to Cups 16oz  (1 pcs).  
b. Orange Juice  → Juice → price $2.00 → maps to Oranges  (1 pcs).  
c. Hot Latte  → Coffee → price $2.30 → no stock link.  
3. Defines modifiers:  
a. Sugar Level : Normal, Less, None.  
b. Topping : Aloe Jelly (+ $0.20), Boba (+ $0.25).  
4. Cashier opens POS → sees menu with categories and modifiers.  
5. When a sale is finalized:  
a. “Iced Latte × 2” posts −2 Cups.  
b. “Orange Juice × 1” posts −1 Orange.  
6. Admin views deduction reflected in the Inventory Journal . 
 
Out of Scope (Phase 1)  
• Multi -ingredient recipes (BOM).  
• Modifier -driven deductions (e.g., extra topping affects stock).  
• Unit conversions between stock items (e.g., kg ↔ pcs).  
• Price -tier by size (to be handled by modifiers).  
• Scheduled or location -based menu availability.  
 
Future Extension (Phase 2)  
• Add Recipe/BOM model : multiple stock items per menu item.  
• Ingredient -level deduction based on recipe composition.  
• Modifier -triggered deduction (e.g., “extra shot” adds 0.02 kg coffee beans).  
• Auto -scaling when size modifiers change portion ratio.  
 
   Summary:  
The Menu & Category Module  now unifies menu management with basic inventory 
linkage. It stays lightweight for Capstone 1 yet structurally ready for Phase 2 upgrades like 
full recipes and cost analytics.

---

