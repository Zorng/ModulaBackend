# Menu Module Boundary (v0)

Status: Phase 1-2 locked  
Owner context: `POSOperation`  
Canonical route prefix: `/v0/menu`

## 1) Module Identity

- Module name: `menu`
- Primary KB references:
  - domain: `knowledge_base/BusinessLogic/2_domain/40_POSOperation/menu_domain_patched_v2.md`
  - process:
    - `knowledge_base/BusinessLogic/4_process/30_POSOperation/10_finalize_sale_orch.md` (consumer of composition query)
    - `knowledge_base/BusinessLogic/4_process/30_POSOperation/13_stock_deduction_on_finalize_sale_process.md` (consumer of TRACKED outputs)
  - modSpec: `knowledge_base/BusinessLogic/5_modSpec/40_POSOperation/menu_module_patched.md`
  - edge cases: `knowledge_base/BusinessLogic/3_contract/10_edgecases/pos_operation_edge_case_sweep_patched.md`

## 2) Owned Facts (Source of Truth)

- Owned table/projection (planned):
  - `v0_menu_categories`
  - `v0_menu_items`
  - `v0_menu_item_branch_visibility`
  - `v0_menu_modifier_groups`
  - `v0_menu_modifier_options`
  - `v0_menu_item_modifier_group_links`
  - `v0_menu_item_base_components`
  - `v0_menu_modifier_option_component_deltas`
- Invariants:
  - menu item/category/modifier ownership is tenant-scoped
  - branch visibility rows must stay inside tenant branch set
  - composition evaluation output must be deterministic and side-effect free
  - component quantities after aggregation must be non-negative
  - component tracking mode is explicit: `TRACKED | NOT_TRACKED`
  - uncategorized is system-derived (no persisted special category row)
- Status/state machine:
  - menu item: `ACTIVE | ARCHIVED`
  - category/group/option: `ACTIVE | ARCHIVED`

## 3) Consumed Facts (Read Dependencies)

- AccessControl:
  - consumed fact: membership/role/branch assignment gates
  - why: branch/tenant scoped authorization
  - consistency mode: strong
- OrgAccount:
  - consumed fact: tenant/branch status and branch existence
  - why: reject writes when tenant/branch not active; validate visibility assignments
  - consistency mode: strong
- Subscription/Entitlements:
  - consumed fact: `core.pos`, `module.inventory`
  - why:
    - `core.pos` gates module access
    - `module.inventory` gates mutation of tracked stock-linked composition
  - consistency mode: strong
- Inventory (read-only dependency):
  - consumed fact: stock item existence/identity for tracked components
  - why: prevent invalid stock-linked composition references
  - consistency mode: strong (read validation only)

## 4) Commands (Write Surface)

- Endpoint: `POST /v0/menu/items`
  - Action key: `menu.items.create`
  - Required scope/effect: `BRANCH / WRITE`
  - Allowed roles: `OWNER`, `ADMIN`, `MANAGER`
  - Idempotency required: yes
- Endpoint: `PATCH /v0/menu/items/:menuItemId`
  - Action key: `menu.items.update`
  - Required scope/effect: `BRANCH / WRITE`
  - Allowed roles: `OWNER`, `ADMIN`, `MANAGER`
  - Idempotency required: yes
- Endpoint: `POST /v0/menu/items/:menuItemId/archive`
  - Action key: `menu.items.archive`
  - Required scope/effect: `BRANCH / WRITE`
  - Allowed roles: `OWNER`, `ADMIN`
  - Idempotency required: yes
- Endpoint: `POST /v0/menu/items/:menuItemId/restore`
  - Action key: `menu.items.restore`
  - Required scope/effect: `BRANCH / WRITE`
  - Allowed roles: `OWNER`, `ADMIN`
  - Idempotency required: yes
- Endpoint: `PUT /v0/menu/items/:menuItemId/visibility`
  - Action key: `menu.items.visibility.set`
  - Required scope/effect: `TENANT / WRITE`
  - Allowed roles: `OWNER`, `ADMIN`, `MANAGER`
  - Idempotency required: yes
- Endpoint: `POST /v0/menu/categories`
  - Action key: `menu.categories.create`
  - Required scope/effect: `TENANT / WRITE`
  - Allowed roles: `OWNER`, `ADMIN`, `MANAGER`
  - Idempotency required: yes
- Endpoint: `PATCH /v0/menu/categories/:categoryId`
  - Action key: `menu.categories.update`
  - Required scope/effect: `TENANT / WRITE`
  - Allowed roles: `OWNER`, `ADMIN`, `MANAGER`
  - Idempotency required: yes
- Endpoint: `POST /v0/menu/categories/:categoryId/archive`
  - Action key: `menu.categories.archive`
  - Required scope/effect: `TENANT / WRITE`
  - Allowed roles: `OWNER`, `ADMIN`
  - Idempotency required: yes
- Endpoint: `POST /v0/menu/modifier-groups`
  - Action key: `menu.modifierGroups.create`
  - Required scope/effect: `TENANT / WRITE`
  - Allowed roles: `OWNER`, `ADMIN`, `MANAGER`
  - Idempotency required: yes
- Endpoint: `PATCH /v0/menu/modifier-groups/:groupId`
  - Action key: `menu.modifierGroups.update`
  - Required scope/effect: `TENANT / WRITE`
  - Allowed roles: `OWNER`, `ADMIN`, `MANAGER`
  - Idempotency required: yes
- Endpoint: `POST /v0/menu/modifier-groups/:groupId/archive`
  - Action key: `menu.modifierGroups.archive`
  - Required scope/effect: `TENANT / WRITE`
  - Allowed roles: `OWNER`, `ADMIN`
  - Idempotency required: yes
- Endpoint: `POST /v0/menu/modifier-groups/:groupId/options`
  - Action key: `menu.modifierOptions.create`
  - Required scope/effect: `TENANT / WRITE`
  - Allowed roles: `OWNER`, `ADMIN`, `MANAGER`
  - Idempotency required: yes
- Endpoint: `PATCH /v0/menu/modifier-groups/:groupId/options/:optionId`
  - Action key: `menu.modifierOptions.update`
  - Required scope/effect: `TENANT / WRITE`
  - Allowed roles: `OWNER`, `ADMIN`, `MANAGER`
  - Idempotency required: yes
- Endpoint: `POST /v0/menu/modifier-groups/:groupId/options/:optionId/archive`
  - Action key: `menu.modifierOptions.archive`
  - Required scope/effect: `TENANT / WRITE`
  - Allowed roles: `OWNER`, `ADMIN`
  - Idempotency required: yes
- Endpoint: `PUT /v0/menu/items/:menuItemId/composition`
  - Action key: `menu.composition.upsert`
  - Required scope/effect: `TENANT / WRITE`
  - Allowed roles: `OWNER`, `ADMIN`, `MANAGER`
  - Idempotency required: yes
  - Conditional entitlement: if any TRACKED stock-linked component is present, `module.inventory` must be `ENABLED`

Transaction boundary for each write command:
- business writes
- audit write
- outbox write

Primary failure reason codes:
- `TENANT_CONTEXT_REQUIRED`
- `BRANCH_CONTEXT_REQUIRED` (for branch-scope writes)
- `NO_MEMBERSHIP`
- `NO_BRANCH_ACCESS`
- `PERMISSION_DENIED`
- `TENANT_NOT_ACTIVE`
- `BRANCH_FROZEN`
- `SUBSCRIPTION_FROZEN`
- `ENTITLEMENT_BLOCKED`
- `ENTITLEMENT_READ_ONLY`
- `MENU_LIMIT_SOFT_EXCEEDED`
- `MENU_ITEM_NOT_FOUND`
- `MENU_CATEGORY_NOT_FOUND`
- `MENU_MODIFIER_GROUP_NOT_FOUND`
- `MENU_MODIFIER_OPTION_NOT_FOUND`
- `MENU_COMPOSITION_INVALID`
- `MENU_COMPONENT_NEGATIVE_QUANTITY`
- `INVENTORY_ENTITLEMENT_REQUIRED_FOR_TRACKED_COMPONENTS`
- `IDEMPOTENCY_KEY_REQUIRED`
- `IDEMPOTENCY_CONFLICT`
- `IDEMPOTENCY_IN_PROGRESS`

## 5) Queries (Read Surface)

- Endpoint: `GET /v0/menu/items`
  - Action key: `menu.items.list`
  - Scope: `BRANCH / READ`
  - Filters/pagination: `categoryId`, `status`, `search`, `limit`, `offset`
- Endpoint: `GET /v0/menu/items/:menuItemId`
  - Action key: `menu.items.read`
  - Scope: `BRANCH / READ`
- Endpoint: `GET /v0/menu/categories`
  - Action key: `menu.categories.list`
  - Scope: `TENANT / READ`
- Endpoint: `GET /v0/menu/modifier-groups`
  - Action key: `menu.modifierGroups.list`
  - Scope: `TENANT / READ`
- Endpoint: `POST /v0/menu/items/:menuItemId/composition/evaluate`
  - Action key: `menu.composition.evaluate`
  - Scope: `TENANT / READ`
  - Behavior: deterministic side-effect-free aggregation only

Denial reason codes:
- `TENANT_CONTEXT_REQUIRED`
- `BRANCH_CONTEXT_REQUIRED` (branch queries)
- `NO_MEMBERSHIP`
- `NO_BRANCH_ACCESS`
- `PERMISSION_DENIED`
- `BRANCH_NOT_FOUND`
- `MENU_ITEM_NOT_FOUND`

## 6) Event Contract

### Produced events

- `MENU_ITEM_CREATED`
- `MENU_ITEM_UPDATED`
- `MENU_ITEM_ARCHIVED`
- `MENU_ITEM_RESTORED`
- `MENU_ITEM_BRANCH_VISIBILITY_SET`
- `MENU_CATEGORY_CREATED`
- `MENU_CATEGORY_UPDATED`
- `MENU_CATEGORY_ARCHIVED`
- `MODIFIER_GROUP_CREATED`
- `MODIFIER_GROUP_UPDATED`
- `MODIFIER_GROUP_ARCHIVED`
- `MODIFIER_OPTION_CREATED`
- `MODIFIER_OPTION_UPDATED`
- `MODIFIER_OPTION_ARCHIVED`
- `MENU_ITEM_COMPOSITION_UPSERTED`

All produced events:
- include triggering action key
- include tenant/branch/account actor refs
- include entity type/id
- include stable dedupe key
- use compatibility alias required: no

### Subscribed events (planned)

- `ORG_BRANCH_ACTIVATED`
  - Handler purpose: optional branch bootstrap for default visibility behavior
  - Idempotency strategy: dedupe by `(tenant_id, branch_id, event_type)`
- `SUBSCRIPTION_ENTITLEMENT_CHANGED`
  - Handler purpose: re-evaluate tracked composition write eligibility
  - Idempotency strategy: dedupe by outbox id

## 7) Access Control Mapping

- Route registry entries (target):
  - `GET /menu/items` -> `menu.items.list`
  - `POST /menu/items` -> `menu.items.create`
  - `GET /menu/items/:menuItemId` -> `menu.items.read`
  - `PATCH /menu/items/:menuItemId` -> `menu.items.update`
  - `POST /menu/items/:menuItemId/archive` -> `menu.items.archive`
  - `POST /menu/items/:menuItemId/restore` -> `menu.items.restore`
  - `PUT /menu/items/:menuItemId/visibility` -> `menu.items.visibility.set`
  - `GET /menu/categories` -> `menu.categories.list`
  - `POST /menu/categories` -> `menu.categories.create`
  - `PATCH /menu/categories/:categoryId` -> `menu.categories.update`
  - `POST /menu/categories/:categoryId/archive` -> `menu.categories.archive`
  - `GET /menu/modifier-groups` -> `menu.modifierGroups.list`
  - `POST /menu/modifier-groups` -> `menu.modifierGroups.create`
  - `PATCH /menu/modifier-groups/:groupId` -> `menu.modifierGroups.update`
  - `POST /menu/modifier-groups/:groupId/archive` -> `menu.modifierGroups.archive`
  - `POST /menu/modifier-groups/:groupId/options` -> `menu.modifierOptions.create`
  - `PATCH /menu/modifier-groups/:groupId/options/:optionId` -> `menu.modifierOptions.update`
  - `POST /menu/modifier-groups/:groupId/options/:optionId/archive` -> `menu.modifierOptions.archive`
  - `PUT /menu/items/:menuItemId/composition` -> `menu.composition.upsert`
  - `POST /menu/items/:menuItemId/composition/evaluate` -> `menu.composition.evaluate`
- Action catalog entries (target):
  - all `menu.*` action keys above with scope/effect + allowed roles as locked in this artifact
- Entitlement bindings:
  - baseline: `core.pos` for module access
  - conditional write guard: `module.inventory` when composition payload contains TRACKED stock-linked components
- Subscription/branch-status gates:
  - read allowed on frozen branch if branch membership/assignment passes
  - writes denied on frozen branch

## 8) API Contract Docs

- Canonical contract file: `api_contract/menu-v0.md`
- Compatibility alias docs: none
- OpenAPI: `N/A`

## 9) Test Plan (Required)

### Unit tests (module-local)
- path: `src/modules/v0/menu/tests/unit/*`
- cover:
  - composition aggregation and delta rules
  - tracking-mode validation rules
  - reason-code mapping

### Integration tests
- path: `src/integration-tests/v0-menu*.int.test.ts`
- cover:
  - menu item/category/modifier happy paths
  - branch visibility behaviors
  - deny paths (role + branch + entitlement)
  - idempotency replay/conflict
  - atomic rollback (`business + audit + outbox`)

## 10) Boundary Guard Checklist

- [x] No cross-module table writes in repositories (planned boundary)
- [x] Route prefix matches module owner
- [x] Action key prefix matches module owner
- [x] Outbox event type ownership defined
- [x] Canonical behavior documented
- [x] Test requirements listed

## 11) Rollout Notes

- Compatibility aliases to remove later: none
- Migration/backfill needed:
  - none from `/v0` baseline; start fresh in module-owned tables
- Frontend consumption notes:
  - rely on `GET /v0/menu/items` for branch-visible active catalog
  - treat uncategorized as derived group from `categoryId = null`
