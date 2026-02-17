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

### 1) Register account

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

### 2) Send registration OTP

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
- In local mode, fixed OTP behavior remains available via `AUTH_FIXED_OTP` (default `123456`).

Errors:
- `404` account not found
- `422` missing phone
- `429` OTP cooldown/rate-limit

### 3) Verify registration OTP

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

### 4) Login

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

### 5) Refresh session

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

### 6) Logout

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

Errors:
- `422` missing refreshToken

### 7) List tenant context options

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

### 8) Select tenant context

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

### 9) List branch context options

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

### 10) Select branch context

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

### 11) Invite member to tenant (OWNER/ADMIN, legacy alias during boundary migration)

Canonical endpoint:
- `POST /v0/org/memberships/invite`

Legacy alias:
- `POST /v0/auth/memberships/invite`

Auth: `Authorization: Bearer <accessToken>`

Body:

```json
{
  "tenantId": "uuid",
  "phone": "+10000000002",
  "roleKey": "CASHIER"
}
```

Success `201`:

```json
{
  "success": true,
  "data": {
    "membershipId": "uuid",
    "tenantId": "uuid",
    "accountId": "uuid",
    "phone": "+10000000002",
    "roleKey": "CASHIER",
    "status": "INVITED"
  }
}
```

Errors:
- `401` missing/invalid access token
- `403` requester has no permission in tenant
- `409` membership already active
- `422` invalid payload

### 12) Invitation inbox (for current account, legacy alias during boundary migration)

Canonical endpoint:
- `GET /v0/org/memberships/invitations`

Legacy alias:
- `GET /v0/auth/memberships/invitations`

Auth: `Authorization: Bearer <accessToken>`

Success `200`:

```json
{
  "success": true,
  "data": {
    "invitations": [
      {
        "membershipId": "uuid",
        "tenantId": "uuid",
        "tenantName": "Phase 2 Tenant",
        "roleKey": "CASHIER",
        "invitedAt": "2026-02-13T10:00:00.000Z",
        "invitedByMembershipId": "uuid"
      }
    ]
  }
}
```

### 13) Accept invitation (legacy alias during boundary migration)

Canonical endpoint:
- `POST /v0/org/memberships/invitations/:membershipId/accept`

Legacy alias:
- `POST /v0/auth/memberships/invitations/:membershipId/accept`

Auth: `Authorization: Bearer <accessToken>`

Success `200`:

```json
{
  "success": true,
  "data": {
    "membershipId": "uuid",
    "tenantId": "uuid",
    "status": "ACTIVE",
    "activeBranchIds": ["uuid"]
  }
}
```

Errors:
- `401` missing/invalid access token
- `403` invitation belongs to another account
- `404` invitation not found
- `409` invitation is not pending

### 14) Reject invitation (legacy alias during boundary migration)

Canonical endpoint:
- `POST /v0/org/memberships/invitations/:membershipId/reject`

Legacy alias:
- `POST /v0/auth/memberships/invitations/:membershipId/reject`

Auth: `Authorization: Bearer <accessToken>`

Success `200`:

```json
{
  "success": true,
  "data": {
    "membershipId": "uuid",
    "tenantId": "uuid",
    "status": "REJECTED"
  }
}
```

### 15) Change membership role (OWNER/ADMIN, legacy alias during boundary migration)

Canonical endpoint:
- `POST /v0/org/memberships/:membershipId/role`

Legacy alias:
- `POST /v0/auth/memberships/:membershipId/role`

Auth: `Authorization: Bearer <accessToken>`

Body:

```json
{
  "roleKey": "MANAGER"
}
```

Success `200`:

```json
{
  "success": true,
  "data": {
    "membershipId": "uuid",
    "tenantId": "uuid",
    "roleKey": "MANAGER"
  }
}
```

### 16) Revoke membership (OWNER/ADMIN, legacy alias during boundary migration)

Canonical endpoint:
- `POST /v0/org/memberships/:membershipId/revoke`

Legacy alias:
- `POST /v0/auth/memberships/:membershipId/revoke`

Auth: `Authorization: Bearer <accessToken>`

Success `200`:

```json
{
  "success": true,
  "data": {
    "membershipId": "uuid",
    "tenantId": "uuid",
    "status": "DISABLED"
  }
}
```

### 17) Assign membership branches (OWNER/ADMIN, legacy alias during boundary migration)

Canonical endpoint:
- `POST /v0/hr/staff/memberships/:membershipId/branches`

Legacy alias:
- `POST /v0/auth/memberships/:membershipId/branches`

Auth: `Authorization: Bearer <accessToken>`

Body:

```json
{
  "branchIds": ["uuid-1", "uuid-2"]
}
```

Success `200` (target membership is `INVITED`):

```json
{
  "success": true,
  "data": {
    "membershipId": "uuid",
    "tenantId": "uuid",
    "membershipStatus": "INVITED",
    "pendingBranchIds": ["uuid-1", "uuid-2"],
    "activeBranchIds": []
  }
}
```

Success `200` (target membership is `ACTIVE`):

```json
{
  "success": true,
  "data": {
    "membershipId": "uuid",
    "tenantId": "uuid",
    "membershipStatus": "ACTIVE",
    "pendingBranchIds": [],
    "activeBranchIds": ["uuid-1", "uuid-2"]
  }
}
```

Errors:
- `401` missing/invalid access token
- `403` requester has no permission in tenant
- `404` membership not found
- `409` membership is not `INVITED` or `ACTIVE`
- `422` invalid/inactive branch IDs

### 18) Create tenant (legacy alias during boundary migration)

Canonical endpoint:
- `POST /v0/org/tenants` (see `api_contract/tenant-v0.md`)

Legacy alias:
- `POST /v0/auth/tenants`

Auth: `Authorization: Bearer <accessToken>`

Body:

```json
{
  "tenantName": "X Cafe"
}
```

Optional:

```json
{
  "tenantName": "X Cafe",
  "firstBranchName": "Main Branch"
}
```

Success `201`:

```json
{
  "success": true,
  "data": {
    "tenant": {
      "id": "uuid",
      "name": "X Cafe",
      "status": "ACTIVE"
    },
    "ownerMembership": {
      "id": "uuid",
      "roleKey": "OWNER",
      "status": "ACTIVE"
    },
    "branch": null
  }
}
```

If `firstBranchName` is provided and valid, `branch` is returned with:

```json
{
  "id": "uuid",
  "name": "Main Branch",
  "status": "ACTIVE"
}
```

Errors:
- `401` missing/invalid access token or inactive account
- `422` missing `tenantName`
- `409` tenant hard limit reached (`code = FAIRUSE_HARD_LIMIT_EXCEEDED`)
- `429` tenant provisioning rate-limited (`code = FAIRUSE_RATE_LIMITED`)

Fair-use denial envelope:

```json
{
  "success": false,
  "error": "tenant provisioning is rate-limited; try again later",
  "code": "FAIRUSE_RATE_LIMITED"
}
```

## Security Notes (Phase 1)

- Refresh token rotation is enabled.
- Replay of old refresh tokens is denied.
- OTP controls:
  - resend cooldown (default 60 seconds)
  - max sends per hour (default 6)
- Auth events are stored in `v0_auth_audit_events`.
