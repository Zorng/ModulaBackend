# Branch Module — API Contract (Frontend)

This document describes the **current** Branch HTTP contract exposed by the backend.

**Base path:** `/v1/branches`  
**Auth header:** `Authorization: Bearer <accessToken>`

---

## Conventions

### IDs
- All IDs are UUID strings.

### Error shape (common)
Most branch endpoints return errors like:
```json
{ "error": "Human readable message" }
```

### Frozen branch error (operational writes)
When a branch is frozen, operational write endpoints across the system may reject with:
```json
{ "error": "Branch is frozen", "code": "BRANCH_FROZEN" }
```

### Casing
- Branch module uses `snake_case` in request/response bodies (e.g. `tenant_id`, `contact_phone`).

---

## Types

### `BranchStatus`
```ts
type BranchStatus = "ACTIVE" | "FROZEN";
```

### `Branch`
```ts
type Branch = {
  id: string;
  tenant_id: string;
  name: string;
  address: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  status: BranchStatus;
  created_at: string; // ISO date-time
  updated_at: string; // ISO date-time
};
```

---

## Endpoints

### 1) List accessible branches (any authenticated staff)
`GET /v1/branches`

Behavior:
- `ADMIN`: all branches in the tenant
- `MANAGER | CASHIER | CLERK`: assigned branches only

Response `200`:
```json
{
  "branches": [
    {
      "id": "uuid",
      "tenant_id": "uuid",
      "name": "Main Branch",
      "address": null,
      "contact_phone": null,
      "contact_email": null,
      "status": "ACTIVE",
      "created_at": "2025-12-18T00:00:00.000Z",
      "updated_at": "2025-12-18T00:00:00.000Z"
    }
  ]
}
```

Errors:
- `401` if missing/invalid auth

---

### 2) Update branch profile (Admin only)
`PATCH /v1/branches/:branchId`

Request body (all optional; send only fields you want to change):
```json
{
  "name": "New Branch Name",
  "address": "123 Main St",
  "contact_phone": "+1234567890",
  "contact_email": "branch@example.com"
}
```

Response `200`:
```json
{
  "branch": {
    "id": "uuid",
    "tenant_id": "uuid",
    "name": "New Branch Name",
    "address": "123 Main St",
    "contact_phone": "+1234567890",
    "contact_email": "branch@example.com",
    "status": "ACTIVE",
    "created_at": "2025-12-18T00:00:00.000Z",
    "updated_at": "2025-12-18T00:00:00.000Z"
  }
}
```

Validation rules:
- `name` (if provided) must be a non-empty string (max 255 chars)
- `contact_email` (if provided and not null) must be a valid email
- `address/contact_*` may be set to `null` to clear

Errors:
- `401` if missing/invalid auth
- `403` if not an admin
- `404` if branch not found
- `422` if validation fails

---

### 3) Freeze branch (Admin only)
`POST /v1/branches/:branchId/freeze`

Response `200`:
```json
{
  "branch": {
    "id": "uuid",
    "tenant_id": "uuid",
    "name": "Main Branch",
    "address": null,
    "contact_phone": null,
    "contact_email": null,
    "status": "FROZEN",
    "created_at": "2025-12-18T00:00:00.000Z",
    "updated_at": "2025-12-18T00:00:00.000Z"
  }
}
```

Errors:
- `401` if missing/invalid auth
- `403` if not an admin
- `404` if branch not found

---

### 4) Unfreeze branch (Admin only)
`POST /v1/branches/:branchId/unfreeze`

Response `200`: same as freeze, with `status: "ACTIVE"`.

Errors:
- `401` if missing/invalid auth
- `403` if not an admin
- `404` if branch not found

---

## Notes for Frontend
- Branches are **system-provisioned** (no end-user “create branch” flow in Capstone I).
- When a branch is frozen, operational write surfaces (sale finalization, inventory mutations, cash session writes, etc.) should be disabled/guarded client-side, and the UI should handle the backend’s `BRANCH_FROZEN` error gracefully.

