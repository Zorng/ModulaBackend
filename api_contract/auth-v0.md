# Auth Module (`/v0`) — API Contract

This document describes the current `/v0/auth` HTTP contract.

Base path: `/v0/auth`

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "..." }`
- Auth provider:
  - production target: Supabase Auth (`V0_AUTH_PROVIDER=supabase`)
  - local/integration fallback: internal provider (`V0_AUTH_PROVIDER=local`)
- Access-control reason codes for protected endpoints:
  - see `api_contract/access-control-v0.md`
- Audit:
  - tenant-scoped state-changing endpoints emit immutable platform audit events (see `api_contract/audit-v0.md`).

## Endpoints

### Account Onboarding

#### 1) Register account

`POST /v0/auth/register`

Body:

```json
{
  "phone": "+10000000001",
  "password": "Test123!",
  "firstName": "Demo",
  "lastName": "Owner",
  "gender": "MALE",
  "dateOfBirth": "2000-01-01"
}
```

Success `201`:

```json
{
  "success": true,
  "data": {
    "accountId": "uuid",
    "phone": "+10000000001",
    "phoneVerified": false,
    "completedExistingInviteAccount": false
  }
}
```

Note:
- If the phone already exists as an invited shell account (not phone-verified yet), this endpoint completes that account and returns `completedExistingInviteAccount: true`.

Errors:
- `409` account already exists
- `422` invalid input (missing phone/name/password or weak password)

#### 2) Send registration OTP

`POST /v0/auth/otp/send`

Body:

```json
{
  "phone": "+10000000001"
}
```

Success `200`:

```json
{
  "success": true,
  "data": {
    "expiresInMinutes": 10
  }
}
```

Notes:
- In Supabase mode, OTP delivery is delegated to Supabase SMS provider.
- In local/test mode, fixed OTP behavior remains available by default with `AUTH_FIXED_OTP` (default `123456`).
- In staging, real OTP may remain active while fixed fallback verification is explicitly enabled via `V0_AUTH_FIXED_OTP_ENABLED=true`.
- In production, fixed OTP fallback must remain disabled.

Errors:
- `404` account not found
- `422` missing phone
- `429` OTP cooldown/rate-limit

#### 3) Verify registration OTP

`POST /v0/auth/otp/verify`

Body:

```json
{
  "phone": "+10000000001",
  "otp": "123456"
}
```

Success `200`:

```json
{
  "success": true,
  "data": { "verified": true }
}
```

Errors:
- `400` otp not found / expired / attempts exceeded / invalid
- `422` missing phone or otp

### Session Management

#### 4) Login

`POST /v0/auth/login`

Body:

```json
{
  "phone": "+10000000001",
  "password": "Test123!"
}
```

Success `200`:

```json
{
  "success": true,
  "data": {
    "accessToken": "jwt",
    "refreshToken": "opaque",
    "account": {
      "id": "uuid",
      "phone": "+10000000001",
      "firstName": "Demo",
      "lastName": "Owner",
      "phoneVerifiedAt": "2026-02-13T10:00:00.000Z"
    },
    "context": {
      "tenantId": null,
      "branchId": null
    },
    "activeMembershipsCount": 1
  }
}
```

Errors:
- `401` invalid credentials
- `403` phone not verified
- `422` missing phone or password

#### 5) Refresh session

`POST /v0/auth/refresh`

Body:

```json
{
  "refreshToken": "opaque"
}
```

Success `200`:

```json
{
  "success": true,
  "data": {
    "accessToken": "jwt",
    "refreshToken": "opaque-rotated",
    "context": {
      "tenantId": null,
      "branchId": null
    }
  }
}
```

Errors:
- `401` invalid/expired refresh token or inactive account
- `422` missing refreshToken

#### 6) Logout

`POST /v0/auth/logout`

Body:

```json
{
  "refreshToken": "opaque"
}
```

Success `200`:

```json
{
  "success": true
}
```

Notes:
- Logout revokes the active auth session tied to the provided refresh token.
- Access tokens issued from that same session are rejected immediately after logout.

Errors:
- `422` missing refreshToken

### Context Selection

#### 7) List tenant context options

`GET /v0/auth/context/tenants`

Auth: `Authorization: Bearer <accessToken>`

Success `200`:

```json
{
  "success": true,
  "data": {
    "state": "TENANT_SELECTION_REQUIRED",
    "selectedTenantId": null,
    "memberships": [
      {
        "membershipId": "uuid",
        "tenantId": "uuid",
        "tenantName": "X Cafe",
        "roleKey": "OWNER"
      }
    ]
  }
}
```

`state` values:
- `NO_ACTIVE_MEMBERSHIPS`
- `TENANT_AUTO_SELECTED`
- `TENANT_SELECTION_REQUIRED`
- `TENANT_SELECTED`

#### 8) Select tenant context

`POST /v0/auth/context/tenant/select`

Auth: `Authorization: Bearer <accessToken>`

Body:

```json
{
  "tenantId": "uuid"
}
```

Success `200`:

```json
{
  "success": true,
  "data": {
    "accessToken": "jwt",
    "refreshToken": "opaque",
    "context": {
      "tenantId": "uuid",
      "branchId": null
    }
  }
}
```

Transitional note:
- Current response is minimal (token + context IDs).
- Backend source-of-truth profile can be fetched immediately after selection via `GET /v0/org/tenant/current`.

Errors:
- `401` missing/invalid access token or inactive account
- `403` no active membership for tenant
- `422` missing tenantId

#### 9) List branch context options

`GET /v0/auth/context/branches`

Auth: `Authorization: Bearer <accessToken>`

Success `200`:

```json
{
  "success": true,
  "data": {
    "state": "BRANCH_SELECTION_REQUIRED",
    "tenantId": "uuid",
    "selectedBranchId": null,
    "branches": [
      {
        "branchId": "uuid",
        "branchName": "Olympic"
      }
    ]
  }
}
```

`state` values:
- `TENANT_CONTEXT_REQUIRED`
- `NO_BRANCH_ASSIGNED`
- `BRANCH_AUTO_SELECTED`
- `BRANCH_SELECTION_REQUIRED`
- `BRANCH_SELECTED`

#### 10) Select branch context

`POST /v0/auth/context/branch/select`

Auth: `Authorization: Bearer <accessToken>`

Body:

```json
{
  "branchId": "uuid"
}
```

Success `200`:

```json
{
  "success": true,
  "data": {
    "accessToken": "jwt",
    "refreshToken": "opaque",
    "context": {
      "tenantId": "uuid",
      "branchId": "uuid"
    }
  }
}
```

Transitional note:
- Current response is minimal (token + context IDs).
- Backend source-of-truth profile can be fetched immediately after selection via `GET /v0/org/branch/current`.

Errors:
- `401` missing/invalid access token or inactive account
- `403` no active branch assignment for branch
- `409` tenant context is required
- `422` missing branchId

## Boundary Resolution

Auth contract scope is intentionally limited to:
- account identity lifecycle (`register`, `otp`, `login`, `refresh`, `logout`)
- context selection (`/context/tenants`, `/context/tenant/select`, `/context/branches`, `/context/branch/select`)

Canonical non-auth domains:
- membership lifecycle: see `api_contract/membership-v0.md` (`/v0/org/memberships/*`)
- tenant provisioning/profile: see `api_contract/tenant-v0.md` (`/v0/org/tenants`, `/v0/org/tenant/*`)
- staff branch assignment: see HR contract endpoints (`/v0/hr/staff/memberships/:membershipId/branches`)

Compatibility note:
- Legacy alias routes under `/v0/auth/memberships/*` and `/v0/auth/tenants` remain implemented for migration compatibility.
- Frontend should treat these aliases as deprecated and use canonical OrgAccount/HR routes.

## Security Notes (Phase 1)

- Refresh token rotation is enabled.
- Replay of old refresh tokens is denied.
- OTP controls:
  - resend cooldown (default 60 seconds)
  - max sends per hour (default 6)
- Auth events are stored in `v0_auth_audit_events`.
