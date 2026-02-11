# Tenant Module

**Responsibility (Capstone 1):** Tenant business profile + tenant provisioning (creates default branch + initial admin membership via ports).

## Structure

- `api/` - Tenant HTTP routes (`/v1/tenants/*`)
- `app/` - Tenant services (profile + provisioning)
- `domain/` - Tenant entities/types
- `infra/` - Tenant repository (Postgres)
- `tests/` - Tenant unit tests

## Key Features

- Admin-only business profile:
  - `GET /v1/tenants/me`
  - `PATCH /v1/tenants/me`
  - `PUT /v1/tenants/me/logo`
- Staff-visible tenant metadata:
  - `GET /v1/tenants/me/metadata`
- Tenant provisioning port used by Auth onboarding (`POST /v1/auth/register-tenant`)
- Tenant metadata port for other modules (DI from `src/server.ts`)
