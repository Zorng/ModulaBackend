# Testing

## Test Types

- **Unit tests** (default): fast, DB-free tests.
  - Run with: `pnpm test`
- **Integration tests**: DB-backed tests named `*.int.test.ts`
  - Run with: `pnpm test:integration`
  - Use a real Postgres database and run SQL migrations.
  - May exercise HTTP middleware via `supertest`, but must not bind to a network port (`app.listen`).

## Integration Test Prerequisites

1. Create a dedicated test database (example: `modula_test`).
2. Configure `DATABASE_URL` for the test DB via `.env.test.local` (git-ignored).

Example `.env.test.local`:
```
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/modula_test
```

## Running Integration Tests

Run all DB-backed integration tests:
```
pnpm test:integration
```

Run unit + integration tests:
```
pnpm test:all
```

Run a single integration test file:
```
pnpm test:integration -- src/integration-tests/tenant-provisioning.int.test.ts
```

## Safety Notes

- Integration tests reset the database in `src/test-utils/jest.global-setup.cjs` by dropping and recreating the `public` schema, then re-running all `migrations/*.sql`.
- As a safety guard, it refuses to run unless the database name contains `test`.
