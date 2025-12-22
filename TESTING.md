# Testing

## Test Types

- **Unit tests**: `*.test.ts` under module `tests/` folders.
- **DB-backed integration tests**: `src/integration-tests/*.int.test.ts`
  - Do **not** start an HTTP server.
  - Use a real Postgres database and run SQL migrations.

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

Run a single integration test file:
```
pnpm test -- src/integration-tests/tenant-provisioning.int.test.ts
```

## Safety Notes

- `src/test-utils/jest.global-setup.cjs` resets the database by dropping and recreating the `public` schema, then re-running all `migrations/*.sql`.
- As a safety guard, it refuses to run unless the database name contains `test`.

