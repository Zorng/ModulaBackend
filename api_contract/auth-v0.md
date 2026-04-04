# Auth Module (`/v0`) — API Contract

This document describes the current `/v0/auth` HTTP contract.

Base path: `/v0/auth`

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "..." }`
- Auth provider:
  - staging/production target: Supabase Auth (`V0_AUTH_PROVIDER=supabase`)
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
- `completedExistingInviteAccount: true` is a legacy compatibility outcome only when the backend is reconciling an already-existing unverified account shell; membership invite no longer creates new shell accounts for unknown phones.
- Backend canonicalizes phone input before lookup/store, so formatting variants of the same number are treated as the same account identity.
- Cambodia-friendly local input such as `012678990` is accepted and normalized to canonical stored form `+85512678990`.
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

#### 4) Request password reset OTP

`POST /v0/auth/password-reset/request`

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
- Reuses the existing OTP provider path.
- In local/test mode, fixed OTP debug behavior remains available under the same environment rules as registration OTP.
- Successful reset confirmation revokes all active sessions for that account.

Errors:
- `404` account not found
- `422` missing phone
- `429` OTP cooldown/rate-limit

#### 5) Confirm password reset

`POST /v0/auth/password-reset/confirm`

Body:

```json
{
  "phone": "+10000000001",
  "otp": "123456",
  "newPassword": "NewTest123!"
}
```

Success `200`:

```json
{
  "success": true,
  "data": { "reset": true }
}
```

Notes:
- Local mode updates the stored bcrypt password hash.
- Supabase mode updates the Supabase user password.
- Successful reset confirmation marks the phone as verified if it was not already verified.
- All active sessions for the account are revoked immediately after a successful reset.

Errors:
- `400` otp not found / expired / attempts exceeded / invalid
- `404` account not found
- `422` missing phone / otp / newPassword or weak password

### Session Management

#### 6) Login

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

#### 7) Refresh session

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

#### 8) Logout

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

#### 9) Change password

`POST /v0/auth/password/change`

Auth: `Authorization: Bearer <accessToken>`

Body:

```json
{
  "currentPassword": "OldTest123!",
  "newPassword": "NewTest123!"
}
```

Success `200`:

```json
{
  "success": true,
  "data": { "changed": true }
}
```

Notes:
- This is an authenticated in-session password change flow.
- It is separate from forgot-password recovery.
- Successful password change revokes all active sessions for the account, including the current session.

Errors:
- `401` invalid access token or invalid current password
- `422` missing `currentPassword` / `newPassword` or weak password

### Context Selection

#### 10) List tenant context options

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

#### 11) Select tenant context

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

#### 12) List branch context options

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

#### 13) Select branch context

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
- account identity lifecycle (`register`, `otp`, `password reset`, `password change`, `login`, `refresh`, `logout`)
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
