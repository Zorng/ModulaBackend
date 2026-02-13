# Auth Module (`/v0`) — API Contract

This document describes the current `/v0/auth` HTTP contract.

Base path: `/v0/auth`  
Auth: public for all endpoints in this phase

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "..." }`

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
    "phoneVerified": false
  }
}
```

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
    "expiresInMinutes": 10,
    "debugOtp": "123456"
  }
}
```

Notes:
- `debugOtp` is non-production behavior only.
- Fixed OTP in non-production is controlled by `AUTH_FIXED_OTP` (default `123456`).

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
    "activeMembershipsCount": 0
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

## Security Notes (Phase 1)

- Refresh token rotation is enabled.
- Replay of old refresh tokens is denied.
- OTP controls:
  - resend cooldown (default 60 seconds)
  - max sends per hour (default 6)
- Auth events are stored in `v0_auth_audit_events`.
