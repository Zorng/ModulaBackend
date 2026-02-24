# Staff Management Module (`/v0`) — API Contract

This document describes the current canonical Staff Management HTTP contract.

Base path: `/v0/hr`

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "..." }`
- Auth: `Authorization: Bearer <accessToken>`
- Context model:
  - tenant scope is resolved from authenticated membership + path target (`membershipId`).
  - no `tenantId` override is accepted in request body/query.
- Access-control reason codes:
  - see `api_contract/access-control-v0.md`
- Idempotency:
  - `Idempotency-Key` header is accepted but replay headers/body replay semantics are not currently guaranteed for this endpoint.
  - command behavior is deterministic set/replace of branch assignments for target membership.

## Canonical vs Legacy Alias

Canonical endpoint:
- `POST /v0/hr/staff/memberships/:membershipId/branches`

Temporary legacy alias (deprecated):
- `POST /v0/auth/memberships/:membershipId/branches`

Both currently execute the same command (`hr.staff.branch.assign`) and emit the same outbox event (`HR_STAFF_BRANCHES_ASSIGNED`).

## Types

```ts
type MembershipStatus = "INVITED" | "ACTIVE" | "REVOKED";

type StaffMembershipBranchAssignmentResult = {
  membershipId: string;
  tenantId: string;
  membershipStatus: MembershipStatus;
  pendingBranchIds: string[]; // populated when membershipStatus=INVITED
  activeBranchIds: string[]; // populated when membershipStatus=ACTIVE
};
```

## Endpoints

### 1) Assign branches to membership

`POST /v0/hr/staff/memberships/:membershipId/branches`

Path params:
- `membershipId` (UUID)

Body:m

```json
{
  "branchIds": [
    "8d5a4b9d-9ce4-4d6b-adf7-a7e2ae1361dc",
    "f65453e3-87c0-4957-9658-b83760afeef5"
  ]
}
```

Behavior:
- Deduplicates incoming `branchIds`.
- Validates all branch IDs belong to target tenant and are `ACTIVE`.
- If target membership is `INVITED`:
  - stores pending branch assignments
  - returns `pendingBranchIds`, empty `activeBranchIds`
- If target membership is `ACTIVE`:
  - updates active branch assignments
  - returns `activeBranchIds`, empty `pendingBranchIds`

Success `200`:

```json
{
  "success": true,
  "data": {
    "membershipId": "52f73995-5cee-43de-8c63-067f38a8536a",
    "tenantId": "cc4eb8c7-3db6-4bec-a8ff-f0bb36b404a4",
    "membershipStatus": "ACTIVE",
    "pendingBranchIds": [],
    "activeBranchIds": [
      "8d5a4b9d-9ce4-4d6b-adf7-a7e2ae1361dc",
      "f65453e3-87c0-4957-9658-b83760afeef5"
    ]
  }
}
```

Errors:
- `401` authentication required
- `403` requester role cannot assign branches
- `403` access-control denies (`NO_MEMBERSHIP`, `PERMISSION_DENIED`, etc.)
- `404` membership not found
- `409` branch assignment allowed only for invited or active memberships
- `422` `branchIds` contain invalid or inactive branches

### 2) List staff in current tenant

`GET /v0/hr/staff?status=ACTIVE|INVITED|REVOKED|ALL&search=<text>&limit=50&offset=0`

Query:
- `status` optional, default `ALL`
- `search` optional, matches phone/firstName/lastName
- `limit` optional, default `50`, max `200`
- `offset` optional, default `0`

Success `200`:

```json
{
  "success": true,
  "data": [
    {
      "membershipId": "52f73995-5cee-43de-8c63-067f38a8536a",
      "tenantId": "cc4eb8c7-3db6-4bec-a8ff-f0bb36b404a4",
      "accountId": "0b5f0eca-a5de-4f11-9cad-455602b1e80a",
      "roleKey": "CASHIER",
      "membershipStatus": "INVITED",
      "phone": "+10000000002",
      "firstName": null,
      "lastName": null,
      "staffProfileStatus": null,
      "invitedAt": "2026-02-24T10:00:00.000Z",
      "acceptedAt": null,
      "rejectedAt": null,
      "revokedAt": null,
      "pendingBranchIds": [
        "8d5a4b9d-9ce4-4d6b-adf7-a7e2ae1361dc"
      ],
      "activeBranchIds": []
    }
  ]
}
```

Errors:
- `401` authentication required
- `403` tenant context required
- `403` requester role cannot view staff
- `422` invalid `status` value

### 3) Get staff member detail

`GET /v0/hr/staff/:membershipId`

Success `200`:

```json
{
  "success": true,
  "data": {
    "membershipId": "52f73995-5cee-43de-8c63-067f38a8536a",
    "tenantId": "cc4eb8c7-3db6-4bec-a8ff-f0bb36b404a4",
    "accountId": "0b5f0eca-a5de-4f11-9cad-455602b1e80a",
    "roleKey": "CASHIER",
    "membershipStatus": "ACTIVE",
    "phone": "+10000000002",
    "firstName": "Jane",
    "lastName": "Doe",
    "staffProfileStatus": "ACTIVE",
    "invitedAt": "2026-02-24T10:00:00.000Z",
    "acceptedAt": "2026-02-24T10:10:00.000Z",
    "rejectedAt": null,
    "revokedAt": null,
    "pendingBranchIds": [],
    "activeBranchIds": [
      "8d5a4b9d-9ce4-4d6b-adf7-a7e2ae1361dc"
    ]
  }
}
```

Errors:
- `401` authentication required
- `403` tenant context required
- `403` requester role cannot view staff
- `404` membership not found

### 4) Get branch assignments for membership

`GET /v0/hr/staff/memberships/:membershipId/branches`

Success `200`:

```json
{
  "success": true,
  "data": {
    "membershipId": "52f73995-5cee-43de-8c63-067f38a8536a",
    "tenantId": "cc4eb8c7-3db6-4bec-a8ff-f0bb36b404a4",
    "membershipStatus": "ACTIVE",
    "pendingBranchIds": [],
    "activeBranchIds": [
      "8d5a4b9d-9ce4-4d6b-adf7-a7e2ae1361dc"
    ]
  }
}
```

Errors:
- `401` authentication required
- `403` tenant context required
- `403` requester role cannot view staff
- `404` membership not found

## Tracking

- `_refactor-artifact/06-hr/01_staff-management-rollout-v0.md`
