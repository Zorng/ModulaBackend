# Auth Module Tests

This directory contains unit and integration tests for the authentication module.

## Test Files

- `password.service.test.ts` - Tests for password hashing and verification
- `token.service.test.ts` - Tests for JWT token generation and verification
- `auth.service.test.ts` - Unit tests for auth service business logic (mocked dependencies)
- `auth.test.ts` - Integration tests for end-to-end auth flows (requires database)

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run specific test file
pnpm test password.service.test

# Run with coverage
pnpm test -- --coverage
```

## Test Coverage

The tests cover:

- ✅ Password hashing and verification (bcrypt)
- ✅ JWT token generation and validation
- ✅ User registration flow
- ✅ Login authentication
- ✅ Token refresh mechanism
- ✅ Session management
- ✅ Logout functionality

## Environment Setup

For integration tests, ensure your test database is configured:

```env
DATABASE_URL=postgresql://localhost:5432/modula_test
```

Run migrations before integration tests:

```bash
NODE_ENV=test pnpm run migrate
```
