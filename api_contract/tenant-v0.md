# Tenant Module (`/v0`) — API Contract

This document describes the current tenant contract for `/v0`.

Base path: `/v0/org`

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "..." }`
- Auth: `Authorization: Bearer <accessToken>`
- Context model:
  - Request uses tenant context from token.
  - No `tenantId` override accepted in query/body.
- Access-control reason codes:
  - see `api_contract/access-control-v0.md`

## Types

```ts
type TenantStatus = "ACTIVE" | "FROZEN";

type CurrentTenantProfile = {
  tenantId: string;
  tenantName: string;
  tenantAddress: string | null;
  contactNumber: string | null;
  logoUrl: string | null;
  status: TenantStatus;
};

type TenantProvisionResult = {
  tenant: {
    id: string;
    name: string;
    status: "ACTIVE";
  };
  ownerMembership: {
    id: string;
    roleKey: "OWNER";
    status: "ACTIVE";
  };
  branch: null;
};
```

## Endpoints

### 1) Create tenant (authenticated account)

`POST /v0/org/tenants`

Auth: `Authorization: Bearer <accessToken>`

Body:

```json
{
  "tenantName": "X Cafe"
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

Notes:
- `branch` is always `null` at tenant provisioning time.
- First branch activation is a separate orchestration after payment confirmation.

Errors:
- `401` missing/invalid access token or inactive account
- `422` missing `tenantName`
- `409` tenant hard limit reached (`code = FAIRUSE_HARD_LIMIT_EXCEEDED`)
- `429` tenant provisioning rate-limited (`code = FAIRUSE_RATE_LIMITED`)

Compatibility note:
- Legacy alias remains available at `POST /v0/auth/tenants` during boundary migration.

### 2) Get current tenant profile

`GET /v0/org/tenant/current`

Success `200`:

```json
{
  "success": true,
  "data": {
    "tenantId": "uuid",
    "tenantName": "X Cafe",
    "tenantAddress": "Street 2004",
    "contactNumber": "+85512000001",
    "logoUrl": "https://example.com/logo.png",
    "status": "ACTIVE"
  }
}
```

Errors:
- `401` missing/invalid access token
- `403` `TENANT_CONTEXT_REQUIRED` or `NO_MEMBERSHIP` (from centralized access control)
- `403` `ACCESS_CONTROL_ROUTE_NOT_REGISTERED` if route is not registered (fail-closed)
- `404` tenant not found
