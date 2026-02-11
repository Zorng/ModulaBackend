# Tenant Module — API Contract (Frontend)

This document describes the **current** Tenant HTTP contract exposed by the backend.

**Base path:** `/v1/tenants`  
**Auth header:** `Authorization: Bearer <accessToken>`

---

## Conventions

### IDs
- All IDs are UUID strings.

### Error shape (common)
Most tenant endpoints return errors like:
```json
{ "error": "Human readable message" }
```

Upload endpoints may return multer errors shaped like:
```json
{ "error": "File Too Large", "message": "Image must be less than 5MB" }
```

### Casing
- Tenant module uses `snake_case` in request/response bodies (e.g. `logo_url`, `contact_phone`).

---

## Types

### `TenantStatus`
```ts
type TenantStatus = "ACTIVE" | "PAST_DUE" | "EXPIRED" | "CANCELED";
```

### `Tenant` (admin-visible business profile fields)
Note: `GET /v1/tenants/me` returns `TenantProfile` (includes `branch_count`). Update endpoints return `Tenant` (no `branch_count`).
```ts
type Tenant = {
  id: string;
  name: string;
  business_type: string | null;
  status: TenantStatus;
  logo_url: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_address: string | null;
  created_at: string; // ISO date-time
  updated_at: string; // ISO date-time
};
```

### `TenantMetadata` (staff-visible projection)
```ts
type TenantMetadata = {
  id: string;
  name: string;
  logo_url: string | null;
  status: TenantStatus;
};
```

### `TenantProfile` (admin-only business profile)
```ts
type TenantProfile = {
  id: string;
  name: string;
  business_type: string | null;
  status: TenantStatus;
  logo_url: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_address: string | null;
  created_at: string; // ISO date-time
  updated_at: string; // ISO date-time
  branch_count: number;
};
```

---

## Endpoints

### 1) Get tenant metadata (any authenticated staff)
`GET /v1/tenants/me/metadata`

Response `200`:
```json
{
  "tenant": {
    "id": "uuid",
    "name": "Test Restaurant",
    "logo_url": null,
    "status": "ACTIVE"
  }
}
```

Errors:
- `401` if missing/invalid auth
- `404` if tenant is missing

---

### 2) Get tenant business profile (Admin only)
`GET /v1/tenants/me`

Response `200`:
```json
{
  "tenant": {
    "id": "uuid",
    "name": "Test Restaurant",
    "business_type": "RESTAURANT",
    "status": "ACTIVE",
    "logo_url": null,
    "contact_phone": null,
    "contact_email": null,
    "contact_address": null,
    "created_at": "2025-12-18T00:00:00.000Z",
    "updated_at": "2025-12-18T00:00:00.000Z",
    "branch_count": 1
  }
}
```

Errors:
- `401` if missing/invalid auth
- `403` if not an admin
- `404` if tenant is missing

---

### 3) Update tenant business profile (Admin only)
`PATCH /v1/tenants/me`

Request body (all optional; send only fields you want to change):
```json
{
  "name": "New Business Name",
  "contact_phone": "+1234567890",
  "contact_email": "owner@example.com",
  "contact_address": "123 Main St"
}
```

Response `200`:
```json
{
  "tenant": {
    "id": "uuid",
    "name": "New Business Name",
    "business_type": "RESTAURANT",
    "status": "ACTIVE",
    "logo_url": null,
    "contact_phone": "+1234567890",
    "contact_email": "owner@example.com",
    "contact_address": "123 Main St",
    "created_at": "2025-12-18T00:00:00.000Z",
    "updated_at": "2025-12-18T00:00:00.000Z"
  }
}
```

Validation rules:
- `name` must be a non-empty string (max 255 chars)
- `contact_email` must be a valid email if provided (or `null`)
- `contact_*` fields may be set to `null` to clear

Errors:
- `401` if missing/invalid auth
- `403` if not an admin
- `404` if tenant is missing
- `422` if validation fails

---

### 4) Upload/update tenant logo (Admin only)
`PUT /v1/tenants/me/logo`

Request body:
- `multipart/form-data`
- field name: `image`
- allowed types: `image/jpeg`, `image/jpg`, `image/png`, `image/webp` (max 5MB)

Response `200`:
```json
{
  "tenant": {
    "id": "uuid",
    "name": "Test Restaurant",
    "business_type": "RESTAURANT",
    "status": "ACTIVE",
    "logo_url": "https://<storage>/<tenantId>/tenant/<file>.png",
    "contact_phone": null,
    "contact_email": null,
    "contact_address": null,
    "created_at": "2025-12-18T00:00:00.000Z",
    "updated_at": "2025-12-18T00:00:00.000Z"
  }
}
```

Errors:
- `401` if missing/invalid auth
- `403` if not an admin
- `422` if no `image` file is provided
- `400` if multer rejects file (size/type); may return `{ error, message }`

---

## Notes for Frontend
- Tenant selection (when an account has multiple tenants) is handled by the **Auth** module (`POST /v1/auth/select-tenant`).
- Use `GET /v1/tenants/me/metadata` for lightweight UI surfaces (header/logo/name) without requiring admin role.
