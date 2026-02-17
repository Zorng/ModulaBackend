# Membership Module (`/v0`) — API Contract

This document describes canonical membership lifecycle endpoints under OrgAccount.

Base path: `/v0/org/memberships`

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "..." }`
- Auth: `Authorization: Bearer <accessToken>`
- Access-control reason codes:
  - see `api_contract/access-control-v0.md`

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

### 2) List invitation inbox

`GET /v0/org/memberships/invitations`

### 3) Accept invitation

`POST /v0/org/memberships/invitations/:membershipId/accept`

### 4) Reject invitation

`POST /v0/org/memberships/invitations/:membershipId/reject`

### 5) Change role

`POST /v0/org/memberships/:membershipId/role`

Body:

```json
{
  "roleKey": "MANAGER"
}
```

### 6) Revoke membership

`POST /v0/org/memberships/:membershipId/revoke`

## Compatibility Notes

- Legacy aliases under `/v0/auth/memberships/*` remain available during boundary migration.
- Canonical action keys emitted by these endpoints:
  - `org.membership.invite`
  - `org.membership.invitations.list`
  - `org.membership.invitation.accept`
  - `org.membership.invitation.reject`
  - `org.membership.role.change`
  - `org.membership.revoke`
