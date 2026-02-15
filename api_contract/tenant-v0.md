# Tenant Module (`/v0`) — API Contract

This document describes the current tenant profile read contract for `/v0`.

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
```

## Endpoint

### 1) Get current tenant profile

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
- `404` tenant not found
