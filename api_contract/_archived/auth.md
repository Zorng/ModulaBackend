# Auth Module — API Contract (Frontend)

This document describes the **current** Authentication & Authorization HTTP contract exposed by the backend.

**Base path:** `/v1/auth`  
**Auth header (protected routes):** `Authorization: Bearer <accessToken>`

---

## Conventions

### IDs
- All IDs are UUID strings.

### Error shape (common)
Most auth endpoints return errors like:
```json
{ "error": "Human readable message" }
```

### Casing
- Most request/response keys are `snake_case`.
- `tokens` uses **camelCase** (`accessToken`, `refreshToken`, `expiresIn`).

---

## Core Types

### `EmployeeRole`
`ADMIN | MANAGER | CASHIER | CLERK`

### `Tokens`
```ts
type Tokens = {
  accessToken: string;   // JWT
  refreshToken: string;  // opaque token (stored hashed server-side)
  expiresIn: number;     // seconds
};
```

### `Employee`
```ts
type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  status: "ACTIVE" | "INVITED" | "DISABLED";
};
```

### `Tenant`
Minimal fields (additional fields may be present depending on backend version):
```ts
type Tenant = {
  id: string;
  name: string;
  business_type?: string | null;
  status: string; // currently: ACTIVE | PAST_DUE | EXPIRED | CANCELED
};
```

### `BranchAssignment`
```ts
type BranchAssignment = {
  id: string;
  employee_id: string;
  branch_id: string;
  branch_name?: string;
  role: EmployeeRole;
  active: boolean;
  assigned_at: string; // ISO date-time
};
```

### `LoginResponse` (single-tenant session established)
```ts
type LoginResponse = {
  employee: Employee;
  tokens: Tokens;
  branch_assignments: BranchAssignment[];
};
```

### `TenantSelectionRequiredResponse` (account has 2+ memberships)
```ts
type TenantSelectionRequiredResponse = {
  requires_tenant_selection: true;
  selection_token: string; // short-lived
  memberships: Array<{
    tenant: { id: string; name: string };
    employeeId: string; // NOTE: camelCase
  }>;
};
```

---

## Tenant Selection Flow (multi-tenant accounts)

1. Call `POST /v1/auth/login`.
2. If the response contains `requires_tenant_selection: true`, show the user the `memberships[].tenant`.
3. Call `POST /v1/auth/select-tenant` with the `selection_token` and chosen `tenant_id` (and optional `branch_id`).
4. Use returned `tokens.accessToken` for authenticated calls.

---

## Endpoints

### 1) Request OTP (tenant registration)
`POST /v1/auth/register-tenant/request-otp`

Request:
```json
{ "phone": "+1234567890" }
```

Response (dev may include `debugOtp`):
```json
{ "message": "OTP sent", "debugOtp": "123456" }
```

Notes:
- `debugOtp` is only returned when `NODE_ENV !== "production"`.
- OTP verification for tenant registration is still being finalized (registration currently does not require OTP).

---

### 2) Register tenant (creates initial admin membership + tokens)
`POST /v1/auth/register-tenant`

Request:
```json
{
  "business_name": "My Restaurant",
  "phone": "+1234567890",
  "first_name": "John",
  "last_name": "Doe",
  "password": "SecurePass123!",
  "business_type": "RETAIL"
}
```

Response `201`:
```json
{
  "tenant": { "id": "uuid", "name": "My Restaurant", "business_type": "RETAIL", "status": "ACTIVE" },
  "employee": { "id": "uuid", "first_name": "John", "last_name": "Doe", "phone": "+1234567890", "status": "ACTIVE" },
  "tokens": { "accessToken": "...", "refreshToken": "...", "expiresIn": 43200 }
}
```

Notes:
- This endpoint is kept for compatibility, but tenant provisioning is owned by the Tenant module.

---

### 3) Login
`POST /v1/auth/login`

Request:
```json
{ "phone": "+1234567890", "password": "SecurePass123!" }
```

Response `200`:
- Either `LoginResponse`
- Or `TenantSelectionRequiredResponse`

---

### 4) Select tenant (after multi-tenant login / forgot-password confirm)
`POST /v1/auth/select-tenant`

Request:
```json
{
  "selection_token": "short-lived-token",
  "tenant_id": "uuid",
  "branch_id": "uuid"
}
```

Response `200`: `LoginResponse`

Notes:
- `branch_id` is optional; if omitted, backend resolves branch context from membership defaults/last-used/assignments.

---

### 5) Refresh tokens
`POST /v1/auth/refresh`

Request:
```json
{ "refresh_token": "opaque-refresh-token" }
```

Response `200`:
```json
{ "tokens": { "accessToken": "...", "refreshToken": "...", "expiresIn": 43200 } }
```

---

### 6) Logout (revoke refresh token)
`POST /v1/auth/logout`

Request:
```json
{ "refresh_token": "opaque-refresh-token" }
```

Response `200`:
```json
{ "message": "Logged out successfully" }
```

---

### 7) Forgot password (request OTP)
`POST /v1/auth/password/forgot`

Request:
```json
{ "phone": "+1234567890" }
```

Response `200` (dev may include `debugOtp`):
```json
{ "message": "OTP sent", "debugOtp": "123456" }
```

---

### 8) Forgot password (confirm OTP + set new password)
`POST /v1/auth/password/forgot/confirm`

Request:
```json
{ "phone": "+1234567890", "otp": "123456", "new_password": "NewPassword123!" }
```

Response `200`:
- Either `LoginResponse`
- Or `TenantSelectionRequiredResponse`

Notes:
- On success, backend revokes sessions across memberships for that account.

---

### 9) Change password (logged-in; no OTP)
`POST /v1/auth/password/change` *(protected)*

Request:
```json
{ "current_password": "OldPassword123!", "new_password": "NewPassword123!" }
```

Response `200`:
```json
{ "tokens": { "accessToken": "...", "refreshToken": "...", "expiresIn": 43200 } }
```

Notes:
- This is the “reset password without OTP” flow (user must be logged in and provide current password).
- Backend revokes other sessions for the account.

---

### 10) Accept staff invite (set password and activate membership)
`POST /v1/auth/invites/accept/:token`

Request:
```json
{ "password": "SecurePass123!" }
```

Response `200`:
```json
{
  "employee": { "id": "uuid", "first_name": "A", "last_name": "B", "phone": "+123", "status": "ACTIVE" },
  "tokens": { "accessToken": "...", "refreshToken": "...", "expiresIn": 43200 }
}
```

Notes:
- Invite lifecycle (create/resend/revoke) belongs to Staff Management, but acceptance is exposed under Auth to set credentials and issue tokens.

