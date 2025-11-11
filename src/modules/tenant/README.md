# Tenant Module

**Responsibility:** Tenants, branches, staff seats

## Structure

- `api/` - HTTP routes and controllers
- `app/` - Use cases (create tenant, manage branches)
- `domain/` - Tenant entity, branch policies
- `infra/` - Tenant repository
- `migrations/` - Tenant-related database tables
- `tests/` - Module tests

## Key Features

- Multi-tenant management
- Branch management
- Staff seat allocation
