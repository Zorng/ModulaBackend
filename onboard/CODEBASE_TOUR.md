# Codebase Tour

This is a quick map of where to look for things.

## Feature Modules

Most functionality lives under:

- `src/modules/<module>/api/` HTTP routes, schemas, controllers
- `src/modules/<module>/app/` use cases and orchestration inside the module boundary
- `src/modules/<module>/domain/` domain entities and invariants (code-level)
- `src/modules/<module>/infra/` repositories and persistence adapters

## Platform

Cross-cutting infrastructure:

- `src/platform/` database, config, middleware, logging, events

## Database

- `migrations/` is the source of schema changes
- `migrations/_seed_dev.sql` is the dev/demo seed

## Frontend Integration

- `api_contract/` contains the HTTP contracts we expect the frontend to follow
  - `api_contract/_archived/` contains legacy/prototype contracts (kept for reference only)
- Swagger is available when the server runs (see `README.md`)
