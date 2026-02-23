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

type ModifierOption = {
  id: string;
  groupId: string;
  label: string;
  priceDelta: number;
  status: ActiveStatus;
  componentDeltas: ModifierDelta[];
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
  modifierGroups: ModifierGroup[];
  baseComponents: Component[];
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

#### 2) List menu items (branch-visible)

`GET /v0/menu/items?status=active|archived|all&categoryId=uuid&search=text&limit=50&offset=0`

Action key: `menu.items.list`

Notes:
- Returns items visible to current branch context.
- `status` defaults to `active`.

Errors:
- `401` missing/invalid token
- `403` context/membership/branch access denial reason

#### 3) List tenant menu items (all branches, management view)

`GET /v0/menu/items/all?status=active|archived|all&categoryId=uuid&search=text&branchId=uuid&limit=50&offset=0`

Action key: `menu.items.listAll`

Notes:
- Returns all tenant menu items and includes `visibleBranchIds` per item.
- Optional `branchId` filters to items visible in that branch.
- Intended for management screens (cross-branch catalog view).

#### 4) Get menu item detail

`GET /v0/menu/items/:menuItemId`

Action key: `menu.items.read`

Errors:
- `404` `MENU_ITEM_NOT_FOUND`
- access-control errors as above

#### 5) Create menu item

`POST /v0/menu/items`

Action key: `menu.items.create`

Headers:
- `Idempotency-Key: <client key>`

Body:

```json
{
  "name": "Iced Latte",
  "basePrice": 2.5,
  "categoryId": "uuid-or-null",
  "modifierGroupIds": ["uuid"],
  "visibleBranchIds": ["uuid"],
  "imageUrl": null
}
```

Errors:
- `422` `IDEMPOTENCY_KEY_REQUIRED`
- `409` `IDEMPOTENCY_CONFLICT` / `IDEMPOTENCY_IN_PROGRESS`
- `422` `MENU_LIMIT_SOFT_EXCEEDED`
- `422` validation reason codes

#### 6) Update menu item

`PATCH /v0/menu/items/:menuItemId`

Action key: `menu.items.update`

Headers:
- `Idempotency-Key: <client key>`

Body: partial of create payload.

Errors:
- `404` `MENU_ITEM_NOT_FOUND`
- idempotency/access-control/validation errors

#### 7) Archive menu item

`POST /v0/menu/items/:menuItemId/archive`

Action key: `menu.items.archive`

Headers:
- `Idempotency-Key: <client key>`

Errors:
- `404` `MENU_ITEM_NOT_FOUND`
- `422` business guard violations

#### 8) Restore menu item

`POST /v0/menu/items/:menuItemId/restore`

Action key: `menu.items.restore`

Headers:
- `Idempotency-Key: <client key>`

Errors:
- `404` `MENU_ITEM_NOT_FOUND`
- `422` `MENU_LIMIT_SOFT_EXCEEDED`

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

### Categories

#### 10) List categories

`GET /v0/menu/categories?status=active|archived|all`

Action key: `menu.categories.list`

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

#### 13) Archive category

`POST /v0/menu/categories/:categoryId/archive`

Action key: `menu.categories.archive`

Headers:
- `Idempotency-Key: <client key>`

Notes:
- Items linked to archived category resolve as uncategorized for listing.

### Modifiers

#### 14) List modifier groups

`GET /v0/menu/modifier-groups?status=active|archived|all`

Action key: `menu.modifierGroups.list`

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

#### 16) Update modifier group

`PATCH /v0/menu/modifier-groups/:groupId`

Action key: `menu.modifierGroups.update`

Headers:
- `Idempotency-Key: <client key>`

#### 17) Archive modifier group

`POST /v0/menu/modifier-groups/:groupId/archive`

Action key: `menu.modifierGroups.archive`

Headers:
- `Idempotency-Key: <client key>`

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

#### 19) Update modifier option

`PATCH /v0/menu/modifier-groups/:groupId/options/:optionId`

Action key: `menu.modifierOptions.update`

Headers:
- `Idempotency-Key: <client key>`

#### 20) Archive modifier option

`POST /v0/menu/modifier-groups/:groupId/options/:optionId/archive`

Action key: `menu.modifierOptions.archive`

Headers:
- `Idempotency-Key: <client key>`

#### 21) Restore modifier option

`POST /v0/menu/modifier-groups/:groupId/options/:optionId/restore`

Action key: `menu.modifierOptions.restore`

Headers:
- `Idempotency-Key: <client key>`

### Composition

#### 22) Upsert menu item composition

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

#### 23) Evaluate composition (read-only)

`POST /v0/menu/items/:menuItemId/composition/evaluate`

Action key: `menu.composition.evaluate`

Body:

```json
{
  "selectedModifierOptionIds": ["uuid"]
}
```

Success `200`:

```json
{
  "success": true,
  "data": {
    "menuItemId": "uuid",
    "components": [
      {
        "stockItemId": "uuid",
        "quantityInBaseUnit": 350,
        "trackingMode": "TRACKED"
      }
    ]
  }
}
```

Notes:
- Deterministic and side-effect-free.
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
- `404` domain not found codes
- `422` menu validation/invariant codes

## Frontend Rollout Notes

- On branch switch, reload menu list from backend (`GET /v0/menu/items`) rather than relying on cached labels.
- For management screens needing cross-branch catalog data, use `GET /v0/menu/items/all` and render `visibleBranchIds` from backend response.
- Treat uncategorized as derived view (`categoryId = null`), not a mutable category entity.
- For image flow:
  1. upload file via `POST /v0/menu/images/upload`
  2. use returned `imageUrl` in create/update menu item payload.
- For write retries, reuse same `Idempotency-Key` to safely handle network retries.
