# Membership Module (`/v0`) — API Contract

This document describes canonical membership lifecycle endpoints under OrgAccount.

Base path: `/v0/org/memberships`

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "..." }`
- Auth: `Authorization: Bearer <accessToken>`
- Membership lifecycle status: `INVITED | ACTIVE | REVOKED`
- Access-control reason codes: see `api_contract/access-control-v0.md`
- Idempotency header (`Idempotency-Key`) is supported on write endpoints and recommended for client retries.

## Canonical vs Legacy

Canonical endpoints in this contract are under `/v0/org/memberships/*`.

Legacy aliases under `/v0/auth/memberships/*` remain available during migration but are deprecated for frontend integration.

## Endpoints

### 1) Invite member

`POST /v0/org/memberships/invite`

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

### 2) List invitation inbox

`GET /v0/org/memberships/invitations`

Success `200`:

```json
{
  "success": true,
  "data": {
    "invitations": [
      {
        "membershipId": "uuid",
        "tenantId": "uuid",
        "tenantName": "X Cafe",
        "roleKey": "CASHIER",
        "invitedAt": "2026-02-13T10:00:00.000Z",
        "invitedByMembershipId": "uuid"
      }
    ]
  }
}
```

### 3) Accept invitation

`POST /v0/org/memberships/invitations/:membershipId/accept`

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

### 4) Reject invitation

`POST /v0/org/memberships/invitations/:membershipId/reject`

Success `200`:

```json
{
  "success": true,
  "data": {
    "membershipId": "uuid",
    "tenantId": "uuid",
    "status": "REVOKED"
  }
}
```

Errors:
- `401` missing/invalid access token
- `403` invitation belongs to another account
- `404` invitation not found
- `409` invitation is not pending

### 5) Change role

`POST /v0/org/memberships/:membershipId/role`

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

Errors:
- `401` missing/invalid access token
- `403` requester role cannot change membership role
- `404` membership not found
- `409` owner role cannot be changed
- `422` invalid payload or roleKey

### 6) Revoke membership

`POST /v0/org/memberships/:membershipId/revoke`

Success `200`:

```json
{
  "success": true,
  "data": {
    "membershipId": "uuid",
    "tenantId": "uuid",
    "status": "REVOKED"
  }
}
```

Errors:
- `401` missing/invalid access token
- `403` requester role cannot revoke membership
- `404` membership not found
- `409` cannot revoke owner membership or own membership

## Action Keys

- `org.membership.invite`
- `org.membership.invitations.list`
- `org.membership.invitation.accept`
- `org.membership.invitation.revoke`
- `org.membership.role.change`
- `org.membership.revoke`
