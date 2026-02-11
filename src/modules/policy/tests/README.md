# Policy Module Tests

This directory contains comprehensive tests for the policy module.

## Test Structure

```text
tests/
├── api/
│   ├── test-app.ts           # Test Express app setup
│   ├── test-helpers.ts       # Test utilities and context management
│   └── policy.api.test.ts    # API integration tests
└── policy.test.ts            # Unit tests for use cases
```

## Test Types

### Unit Tests (`policy.test.ts`)

Tests the business logic layer (use cases) in isolation with mocked dependencies.

**Test Coverage:**
- `GetTenantPoliciesUseCase` - Retrieve all policies
- `GetAuthPoliciesUseCase` - Retrieve auth policies
- `GetSalesPoliciesUseCase` - Retrieve sales policies
- `GetInventoryPoliciesUseCase` - Retrieve inventory policies
- `UpdateTenantPoliciesUseCase` - Update policies with validation

**Key Test Scenarios:**
- Successful policy retrieval
- Error handling
- Validation rules (password length, VAT rate, etc.)
- Partial updates
- Default value initialization

### API Integration Tests (`api/policy.api.test.ts`)

Tests the complete HTTP API endpoints with a real database connection.

**Test Coverage:**
- `GET /v1/policies` - Get all tenant policies
- `GET /v1/policies/auth` - Get auth policies
- `GET /v1/policies/multi-branch` - Get multi-branch policies
- `GET /v1/policies/sales` - Get sales policies
- `GET /v1/policies/inventory` - Get inventory policies
- `GET /v1/policies/receipts` - Get receipt policies
- `GET /v1/policies/cash-sessions` - Get cash session policies
- `GET /v1/policies/attendance` - Get attendance policies
- `PATCH /v1/policies` - Update any policies

**Key Test Scenarios:**
- Authentication and authorization
- Request validation (Zod schemas)
- Policy updates (single and multiple fields)
- Invalid input handling
- Concurrent updates
- Default values
- Error responses

## Running Tests

### Run All Tests

```bash
pnpm test
```

### Run Only Policy Tests

```bash
pnpm test policy
```

### Run Unit Tests Only

```bash
pnpm test src/modules/policy/tests/policy.test.ts
```

### Run API Tests Only

```bash
pnpm test src/modules/policy/tests/api/policy.api.test.ts
```

### Watch Mode

```bash
pnpm test:watch
```

## Test Requirements

### Database Setup

API tests require a test database with the following tables:
- `tenants`
- `branches`
- `employees`
- `employee_branch_assignments`
- `auth_policies`
- `multi_branch_policies`
- `sales_policies`
- `inventory_policies`
- `receipt_policies`
- `cash_session_policies`
- `attendance_policies`

Run migrations before testing:

```bash
pnpm migrate
```

### Environment Variables

Set the following in your `.env.test` file:

```env
NODE_ENV=test
JWT_SECRET=test-secret
DATABASE_URL=postgresql://user:password@localhost:5432/test_db
```

## Test Data

### Test Context

Each test creates an isolated context with:
- Unique tenant ID
- Unique branch ID
- Unique employee/user ID
- Valid JWT token
- Default policies in all 7 policy tables

### Cleanup

All test data is automatically cleaned up after each test suite using `cleanupTestContext()`.

## Validation Rules Tested

### Auth Policies

- Password min length: 6-32 characters
- Session max age: 1-720 hours
- Invite expiry: 1-720 hours
- Names editable by: `ADMIN_ONLY` or `ANYONE`

### Multi-Branch Policies

- Max branches: 1-100

### Sales Policies

- VAT rate: 0-100%
- KHR rounding mode: `NEAREST_100`, `UP_100`, `DOWN_100`
- KHR rounding apply to: `CASH`, `QR`, `BOTH`
- Discount scope: `PER_ITEM`, `PER_BRANCH`, `BOTH`

### Cash Session Policies

- Max paid out (USD): >= 0
- Max paid out (KHR): >= 0

### Attendance Policies

- Check-in buffer: 0-120 minutes
- Late grace period: 0-240 minutes
- Out of shift mode: `OFF`, `ON`

## Mock Implementations

### Repository Mock

The unit tests use a mocked `IPolicyRepository` with the following methods:
- `getTenantPolicies()`
- `getAuthPolicies()`
- `getSalesPolicies()`
- `getInventoryPolicies()`
- `updateTenantPolicies()`
- `ensureDefaultPolicies()`

### Authentication Mock

API tests use JWT tokens generated with:
- `employeeId`
- `tenantId`
- `branchId`
- `role: "ADMIN"`

## Test Patterns

### Unit Test Pattern

```typescript
it("should do something", async () => {
  // Arrange
  const useCase = new SomeUseCase(mockRepository);
  mockRepository.someMethod.mockResolvedValue(expectedValue);

  // Act
  const result = await useCase.execute(input);

  // Assert
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value).toEqual(expectedValue);
  }
});
```

### API Test Pattern

```typescript
test("should handle request", async () => {
  // Act
  const response = await authRequest(ctx.app, ctx.token)
    .patch("/v1/policies")
    .send({ someField: value });

  // Assert
  expect(response.status).toBe(200);
  expect(response.body.someField).toBe(value);
});
```

## Coverage Goals

- **Use Cases:** 100% coverage (all branches and error paths)
- **API Endpoints:** All routes tested (success and failure cases)
- **Validation:** All Zod schema rules tested
- **Error Handling:** All error scenarios covered

## Known Limitations

1. **Cash Session Module:** Tests exist but module is not complete (marked with TODO)
2. **Attendance Module:** Tests exist but module is not complete (marked with TODO)
3. **Concurrency:** Basic concurrent update test exists but could be expanded
4. **Performance:** No performance/load tests yet

## Future Improvements

1. Add performance/load tests for policy updates
2. Add integration tests with other modules (inventory, sales, etc.)
3. Add tests for policy change audit trail (when implemented)
4. Add tests for policy dependencies validation
5. Add tests for branch-level policy overrides (when implemented)
6. Add snapshot tests for default policy values

