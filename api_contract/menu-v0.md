# Menu Module (`/v0`) — API Contract

This document describes the `/v0/menu` HTTP contract for menu catalog, categories, modifiers, branch visibility, and composition metadata.

Base path: `/v0/menu`

Implementation status:
- Endpoints below are implemented on `/v0`.

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "..." }`
- Auth: `Authorization: Bearer <accessToken>`
- Context model:
  - `tenantId` / `branchId` come from working-context token.
  - no context override via query/body/headers.
- Idempotency:
  - all write endpoints except image upload require `Idempotency-Key`.
  - duplicate replay returns stored response with `Idempotency-Replayed: true`.
- Access-control reason codes:
  - see `api_contract/access-control-v0.md`.

## Read Lanes (Frontend Contract)

Use one of two read lanes depending on UX context:

| Lane | Primary endpoint | Context required | Intended UI |
|---|---|---|---|
| POS lane | `GET /v0/menu/items` | tenant + branch | cashier selling screen (branch menu only) |
| Management lane | `GET /v0/menu/items/all` | tenant only | admin/manager catalog management |

Additional management read:
- `GET /v0/menu/items/:menuItemId` is tenant-scope detail read (not branch-filtered).

## Types

```ts
type TrackingMode = "TRACKED" | "NOT_TRACKED";
type ActiveStatus = "ACTIVE" | "ARCHIVED";

type Component = {
  stockItemId: string;
  quantityInBaseUnit: number;
  trackingMode: TrackingMode;
};

type ModifierDelta = {
  stockItemId: string;
  quantityDeltaInBaseUnit: number;
  trackingMode: TrackingMode;
};

type MenuCategory = {
  id: string;
  tenantId: string;
  name: string;
  status: ActiveStatus;
  createdAt: string;
  updatedAt: string;
};

type MenuCategoryStatusResult = {
  id: string;
  tenantId: string;
  status: ActiveStatus;
  updatedAt: string;
};

type ModifierOption = {
  id: string;
  modifierOptionId: string;
  groupId: string;
  label: string;
  priceDelta: number;
  status: ActiveStatus;
  componentDeltas: ModifierDelta[];
};

type MenuItemModifierOption = Omit<ModifierOption, "priceDelta"> & {
  priceDelta: number | null;
};

type MenuItemModifierOptionEffect = {
  modifierOptionId: string;
  priceDelta: number;
  componentDeltas: ModifierDelta[];
};

Notes:
- `MenuItemDetail.modifierGroups[].options[].priceDelta` comes only from item-level configuration.
- If an attached option has no item-level price yet, item detail returns `priceDelta: null` for that option.
- `ModifierOption.modifierOptionId` is an explicit alias of `ModifierOption.id` for menu-item-scoped editing.
- Shared modifier-option `priceDelta` is ignored for menu-item pricing logic.
- Global modifier option create/update endpoints still manage reusable defaults for structure/backward compatibility.
- Menu-item-specific overrides are written through the item-scoped modifier-option-effects endpoint below.

type ModifierOptionWriteResult = ModifierOption & {
  createdAt: string;
  updatedAt: string;
};

type ModifierOptionStatusResult = {
  id: string;
  groupId: string;
  status: ActiveStatus;
  updatedAt: string;
};

type ModifierGroup = {
  id: string;
  tenantId: string;
  name: string;
  selectionMode: "SINGLE" | "MULTI";
  minSelections: number;
  maxSelections: number;
  isRequired: boolean;
  status: ActiveStatus;
  options: ModifierOption[];
};

type MenuItemModifierGroup = Omit<ModifierGroup, "options"> & {
  options: MenuItemModifierOption[];
};

type ModifierGroupWriteResult = {
  id: string;
  tenantId: string;
  name: string;
  selectionMode: "SINGLE" | "MULTI";
  minSelections: number;
  maxSelections: number;
  isRequired: boolean;
  status: ActiveStatus;
  createdAt: string;
  updatedAt: string;
};

type ModifierGroupStatusResult = {
  id: string;
  tenantId: string;
  status: ActiveStatus;
  updatedAt: string;
};

type MenuItem = {
  id: string;
  tenantId: string;
  name: string;
  basePrice: number;
  categoryId: string | null;
  status: ActiveStatus;
  visibleBranchIds: string[];
  modifierGroupIds: string[];
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

type MenuItemDetail = MenuItem & {
  categoryName: string | null;
  modifierGroups: MenuItemModifierGroup[];
  modifierOptionEffects: MenuItemModifierOptionEffect[];
  baseComponents: Component[];
};

type MenuItemStatusResult = {
  id: string;
  status: ActiveStatus;
  updatedAt: string;
};

type MenuItemVisibilityResult = {
  menuItemId: string;
  visibleBranchIds: string[];
  updatedAt: string;
};

type CompositionUpsertResult = {
  menuItemId: string;
  baseComponents: Component[];
  modifierOptionDeltas: Array<{
    modifierOptionId: string;
    deltas: ModifierDelta[];
  }>;
  updatedAt: string;
};

type CompositionEvaluation = {
  menuItemId: string;
  components: Component[];
};
```

## Endpoints

### Media Upload

#### 1) Upload menu image

`POST /v0/menu/images/upload`

Action key: `menu.images.upload`

Note:
- Shared uploader is also available at `POST /v0/media/images/upload` with `area=menu` (see `api_contract/media-v0.md`).

Headers:
- `Content-Type: multipart/form-data`

Body (form-data):
- `image` (file) — required, jpeg/png/webp, max 5MB

Response `200`:

```json
{
  "success": true,
  "data": {
    "imageUrl": "https://cdn-or-proxy-url",
    "key": "menu-item-images/<tenantId>/<generated-filename>.jpg",
    "filename": "<generated-filename>.jpg",
    "mimeType": "image/jpeg",
    "sizeBytes": 123456
  }
}
```

Errors:
- `400` `UPLOAD_FILE_TOO_LARGE` / `UPLOAD_INVALID_FIELD`
- `422` `UPLOAD_FILE_REQUIRED`
- `503` `IMAGE_STORAGE_NOT_CONFIGURED` / `IMAGE_UPLOAD_FAILED`

### Menu Items

#### 2) POS Read Lane — List menu items (branch-visible)

`GET /v0/menu/items?status=active|archived|all&categoryId=uuid&search=text&limit=50&offset=0`

Action key: `menu.items.list`

Notes:
- Returns items visible to current branch context.
- `status` defaults to `active`.
- Use this for selling flow only.

Response `200` shape:
```ts
{
  success: true;
  data: {
    items: MenuItem[];
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}
```

Errors:
- `401` missing/invalid token
- `403` context/membership/branch access denial reason

#### 3) Management Read Lane — List tenant menu items (all branches)

`GET /v0/menu/items/all?status=active|archived|all&categoryId=uuid&search=text&branchId=uuid&limit=50&offset=0`

Action key: `menu.items.listAll`

Notes:
- Returns all tenant menu items and includes `visibleBranchIds` per item.
- Optional `branchId` filters to items visible in that branch.
- Intended for management screens (cross-branch catalog view).
- Do not use this endpoint as POS cart catalog source.

Response `200` shape:
```ts
{
  success: true;
  data: {
    items: MenuItem[];
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}
```

#### 4) Management Read Lane — Get menu item detail

`GET /v0/menu/items/:menuItemId`

Action key: `menu.items.read`

Notes:
- Tenant-scope read (branch context not required).
- Returns item detail by tenant ownership; not filtered by current branch visibility.
- Intended for management edit/detail screens.

Response `200` shape:
```ts
{ success: true; data: MenuItemDetail }
```

Errors:
- `404` `MENU_ITEM_NOT_FOUND`
- access-control errors as above

#### 5) Create menu item

`POST /v0/menu/items`

Action key: `menu.items.create`

Notes:
- Tenant-scope write (branch context not required).

Headers:
- `Idempotency-Key: <client key>`

Body:

```json
{
  "name": "Iced Latte",
  "basePrice": 2.5,
  "categoryId": "uuid-or-null",
  "modifierGroupIds": ["uuid"],
  "modifierOptionEffects": [
    {
      "modifierOptionId": "uuid",
      "priceDelta": 0.5,
      "componentDeltas": []
    }
  ],
  "visibleBranchIds": ["uuid"],
  "imageUrl": null
}
```

Notes:
- `modifierOptionEffects` is optional.
- If provided, each `modifierOptionId` must belong to a modifier group already attached through `modifierGroupIds`.
- Use this field for item-specific modifier pricing/composition at item create/update time.
- If an attached modifier option has no item-level entry, item detail returns `priceDelta: null` for that option.

Errors:
- `422` `IDEMPOTENCY_KEY_REQUIRED`
- `409` `IDEMPOTENCY_CONFLICT` / `IDEMPOTENCY_IN_PROGRESS`
- `422` `MENU_LIMIT_SOFT_EXCEEDED`
- `422` validation reason codes

Response `200` shape:
```ts
{ success: true; data: MenuItem }
```

#### 6) Update menu item

`PATCH /v0/menu/items/:menuItemId`

Action key: `menu.items.update`

Notes:
- Tenant-scope write (branch context not required).

Headers:
- `Idempotency-Key: <client key>`

Body: partial of create payload.

Notes:
- `modifierOptionEffects` may be sent on update to replace the item-scoped modifier pricing/effect set for the menu item.
- When `modifierGroupIds` and `modifierOptionEffects` are sent together, validation uses the updated modifier-group assignment.

Errors:
- `404` `MENU_ITEM_NOT_FOUND`
- idempotency/access-control/validation errors

Response `200` shape:
```ts
{ success: true; data: MenuItem }
```

#### 7) Archive menu item

`POST /v0/menu/items/:menuItemId/archive`

Action key: `menu.items.archive`

Notes:
- Tenant-scope write (branch context not required).

Headers:
- `Idempotency-Key: <client key>`

Errors:
- `404` `MENU_ITEM_NOT_FOUND`
- `422` business guard violations

Response `200` shape:
```ts
{ success: true; data: MenuItemStatusResult }
```

#### 8) Restore menu item

`POST /v0/menu/items/:menuItemId/restore`

Action key: `menu.items.restore`

Notes:
- Tenant-scope write (branch context not required).

Headers:
- `Idempotency-Key: <client key>`

Errors:
- `404` `MENU_ITEM_NOT_FOUND`
- `422` `MENU_LIMIT_SOFT_EXCEEDED`

Response `200` shape:
```ts
{ success: true; data: MenuItemStatusResult }
```

#### 9) Set branch visibility

`PUT /v0/menu/items/:menuItemId/visibility`

Action key: `menu.items.visibility.set`

Headers:
- `Idempotency-Key: <client key>`

Body:

```json
{
  "visibleBranchIds": ["uuid"]
}
```

Notes:
- Empty list is allowed (item exists but hidden from POS).

Response `200` shape:
```ts
{ success: true; data: MenuItemVisibilityResult }
```

### Categories

#### 10) List categories

`GET /v0/menu/categories?status=active|archived|all`

Action key: `menu.categories.list`

Response `200` shape:
```ts
{ success: true; data: MenuCategory[] }
```

#### 11) Create category

`POST /v0/menu/categories`

Action key: `menu.categories.create`

Headers:
- `Idempotency-Key: <client key>`

Body:

```json
{
  "name": "Coffee"
}
```

Response `200` shape:
```ts
{ success: true; data: MenuCategory }
```

#### 12) Update category

`PATCH /v0/menu/categories/:categoryId`

Action key: `menu.categories.update`

Headers:
- `Idempotency-Key: <client key>`

Body:

```json
{
  "name": "Coffee & Tea"
}
```

Response `200` shape:
```ts
{ success: true; data: MenuCategory }
```

#### 13) Archive category

`POST /v0/menu/categories/:categoryId/archive`

Action key: `menu.categories.archive`

Headers:
- `Idempotency-Key: <client key>`

Notes:
- Items linked to archived category resolve as uncategorized for listing.

Response `200` shape:
```ts
{ success: true; data: MenuCategoryStatusResult }
```

### Modifiers

#### 14) List modifier groups

`GET /v0/menu/modifier-groups?status=active|archived|all`

Action key: `menu.modifierGroups.list`

Response `200` shape:
```ts
{ success: true; data: ModifierGroup[] }
```

#### 15) Create modifier group

`POST /v0/menu/modifier-groups`

Action key: `menu.modifierGroups.create`

Headers:
- `Idempotency-Key: <client key>`

Body:

```json
{
  "name": "Size",
  "selectionMode": "SINGLE",
  "minSelections": 1,
  "maxSelections": 1,
  "isRequired": true
}
```

Errors:
- `409` `MODIFIER_GROUP_DUPLICATE_NAME`

Response `200` shape:
```ts
{ success: true; data: ModifierGroupWriteResult }
```

#### 16) Update modifier group

`PATCH /v0/menu/modifier-groups/:groupId`

Action key: `menu.modifierGroups.update`

Headers:
- `Idempotency-Key: <client key>`

Response `200` shape:
```ts
{ success: true; data: ModifierGroupWriteResult }
```

#### 17) Archive modifier group

`POST /v0/menu/modifier-groups/:groupId/archive`

Action key: `menu.modifierGroups.archive`

Headers:
- `Idempotency-Key: <client key>`

Response `200` shape:
```ts
{ success: true; data: ModifierGroupStatusResult }
```

#### 18) Create modifier option

`POST /v0/menu/modifier-groups/:groupId/options`

Action key: `menu.modifierOptions.create`

Headers:
- `Idempotency-Key: <client key>`

Body:

```json
{
  "label": "Large",
  "priceDelta": 0.5,
  "componentDeltas": [
    {
      "stockItemId": "uuid",
      "quantityDeltaInBaseUnit": 100,
      "trackingMode": "TRACKED"
    }
  ]
}
```

Response `200` shape:
```ts
{ success: true; data: ModifierOptionWriteResult }
```

#### 19) Update modifier option

`PATCH /v0/menu/modifier-groups/:groupId/options/:optionId`

Action key: `menu.modifierOptions.update`

Headers:
- `Idempotency-Key: <client key>`

Response `200` shape:
```ts
{ success: true; data: ModifierOptionWriteResult }
```

#### 20) Archive modifier option

`POST /v0/menu/modifier-groups/:groupId/options/:optionId/archive`

Action key: `menu.modifierOptions.archive`

Headers:
- `Idempotency-Key: <client key>`

Response `200` shape:
```ts
{ success: true; data: ModifierOptionStatusResult }
```

#### 21) Restore modifier option

`POST /v0/menu/modifier-groups/:groupId/options/:optionId/restore`

Action key: `menu.modifierOptions.restore`

Headers:
- `Idempotency-Key: <client key>`

Response `200` shape:
```ts
{ success: true; data: ModifierOptionStatusResult }
```

### Composition

#### 22) Replace menu item modifier option effects

`PUT /v0/menu/items/:menuItemId/modifier-option-effects`

Action key: `menu.itemModifierOptionEffects.replace`

Headers:
- `Idempotency-Key: <client key>`

Body:

```json
{
  "effects": [
    {
      "modifierOptionId": "uuid",
      "priceDelta": 0.5,
      "componentDeltas": [
        {
          "stockItemId": "uuid",
          "quantityDeltaInBaseUnit": 100,
          "trackingMode": "TRACKED"
        }
      ]
    }
  ]
}
```

Rules:
- This endpoint owns menu-item-specific pricing and composition effects for reused modifier options.
- A modifier option may have different `priceDelta` and `componentDeltas` on different menu items.
- Each `modifierOptionId` must belong to a modifier group already attached to the target menu item.
- `effects` contains only explicitly configured item-level prices/effects; attached options without an entry remain unpriced (`priceDelta: null`) until configured.
- Sending an empty `effects` array clears all item-specific overrides for that menu item and leaves attached options unpriced for sell-price purposes.
- Shared modifier-option `priceDelta` is not used as a pricing fallback.
- If payload includes TRACKED component deltas, caller must use a branch-scoped token so inventory entitlement can be evaluated.

Response `200` shape:
```ts
{
  success: true;
  data: {
    menuItemId: string;
    effects: Array<{
      modifierOptionId: string;
      priceDelta: number;
      componentDeltas: ModifierDelta[];
    }>;
    updatedAt: string;
  };
}
```

#### 23) Upsert menu item composition

`PUT /v0/menu/items/:menuItemId/composition`

Action key: `menu.composition.upsert`

Headers:
- `Idempotency-Key: <client key>`

Body:

```json
{
  "baseComponents": [
    {
      "stockItemId": "uuid",
      "quantityInBaseUnit": 250,
      "trackingMode": "TRACKED"
    }
  ]
}
```

Entitlement behavior:
- If payload includes TRACKED stock-linked components:
  - requires `module.inventory = ENABLED`.
- If only NOT_TRACKED components are used:
  - allowed without inventory entitlement.

Errors:
- `403` `ENTITLEMENT_BLOCKED` / `ENTITLEMENT_READ_ONLY`
- `403` `INVENTORY_ENTITLEMENT_REQUIRED_FOR_TRACKED_COMPONENTS`
- `422` `MENU_COMPOSITION_INVALID` / `MENU_COMPONENT_NEGATIVE_QUANTITY`

Response `200` shape:
```ts
{ success: true; data: CompositionUpsertResult }
```

#### 24) Evaluate composition (read-only)

`POST /v0/menu/items/:menuItemId/composition/evaluate`

Action key: `menu.composition.evaluate`

Body:

```json
{
  "selectedModifierOptionIds": ["uuid"]
}
```

Response `200` shape:
```ts
{ success: true; data: CompositionEvaluation }
```

Notes:
- Deterministic and side-effect-free.
- Uses menu-item-specific modifier option overrides when present; otherwise falls back to reusable global option defaults.
- Output is consumed by sale finalize orchestration, not inventory mutation.

## Standard Error Set

Common errors across write endpoints:
- `401` `INVALID_ACCESS_TOKEN`
- `403` context/membership/permission denial codes
- `403` `BRANCH_FROZEN` / `SUBSCRIPTION_FROZEN`
- `403` `ENTITLEMENT_BLOCKED` / `ENTITLEMENT_READ_ONLY`
- `422` `IDEMPOTENCY_KEY_REQUIRED`
- `409` `IDEMPOTENCY_CONFLICT`
- `409` `IDEMPOTENCY_IN_PROGRESS`
- `409` `MENU_ITEM_DUPLICATE_NAME` / `MENU_CATEGORY_DUPLICATE_NAME`
- `409` `MODIFIER_GROUP_DUPLICATE_NAME` / `MODIFIER_OPTION_DUPLICATE_LABEL`
- `404` domain not found codes
- `422` menu validation/invariant codes

## Frontend Rollout Notes

- Route frontend by lane:
  1. POS lane: `GET /v0/menu/items`
  2. Management lane: `GET /v0/menu/items/all` (+ `GET /v0/menu/items/:menuItemId` for detail/edit)
- On branch switch, reload POS lane list (`GET /v0/menu/items`) rather than relying on cached labels.
- For management screens, render `visibleBranchIds` from backend response and treat branch visibility as overlay state.
- Treat uncategorized as derived view (`categoryId = null`), not a mutable category entity.
- For image flow:
  1. upload file via `POST /v0/menu/images/upload`
  2. use returned `imageUrl` in create/update menu item payload.
- For write retries, reuse same `Idempotency-Key` to safely handle network retries.
