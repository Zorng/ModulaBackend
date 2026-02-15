# Branch Module (`/v0`) — API Contract

This document describes the current branch profile/visibility read contract for `/v0`.

Base path: `/v0/org`

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "..." }`
- Auth: `Authorization: Bearer <accessToken>`
- Context model:
  - Endpoints use token context.
  - No `tenantId` / `branchId` override accepted.
- Access-control reason codes:
  - see `api_contract/access-control-v0.md`

## Types

```ts
type BranchStatus = "ACTIVE" | "FROZEN";

type BranchProfile = {
  branchId: string;
  tenantId: string;
  branchName: string;
  branchAddress: string | null;
  contactNumber: string | null;
  status: BranchStatus;
};
```

## Endpoints

### 1) List accessible branches in current tenant

`GET /v0/org/branches/accessible`

Notes:
- Visibility is assignment-scoped.
- Returns only branches where user has active assignment in current tenant.
- Branches may be `ACTIVE` or `FROZEN`.

Success `200`:

```json
{
  "success": true,
  "data": [
    {
      "branchId": "uuid",
      "tenantId": "uuid",
      "branchName": "Olympic",
      "branchAddress": "Street 2004",
      "contactNumber": "+85512000009",
      "status": "ACTIVE"
    }
  ]
}
```

Errors:
- `401` missing/invalid access token
- `403` `TENANT_CONTEXT_REQUIRED` or `NO_MEMBERSHIP` (from centralized access control)
- `403` `ACCESS_CONTROL_ROUTE_NOT_REGISTERED` if route is not registered (fail-closed)

### 2) Get current branch profile

`GET /v0/org/branch/current`

Notes:
- Requires branch context in token.
- Reads branch profile even when branch is `FROZEN`.

Success `200`:

```json
{
  "success": true,
  "data": {
    "branchId": "uuid",
    "tenantId": "uuid",
    "branchName": "Olympic",
    "branchAddress": "Street 2004",
    "contactNumber": "+85512000009",
    "status": "FROZEN"
  }
}
```

Errors:
- `401` missing/invalid access token
- `403` `TENANT_CONTEXT_REQUIRED` or `NO_MEMBERSHIP` (from centralized access control)
- `403` `BRANCH_CONTEXT_REQUIRED` or `NO_BRANCH_ACCESS`
- `404` branch not found
