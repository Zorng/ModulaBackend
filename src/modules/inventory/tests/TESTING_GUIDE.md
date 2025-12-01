# Inventory Module Testing Guide

## Testing Strategy

This guide outlines how to test the inventory module to ensure all components work together correctly.

## Test Structure

```
tests/
├── unit/                           # Unit tests (mocked dependencies)
│   ├── stock-item.use-case.test.ts
│   ├── inventory-journal.use-case.test.ts
│   ├── menu-stock-map.use-case.test.ts
│   ├── store-policy.use-case.test.ts
│   ├── branch-stock.use-case.test.ts
│   └── event-handlers.test.ts
├── integration/                    # Integration tests (real database)
│   ├── stock-operations.integration.test.ts
│   ├── event-flow.integration.test.ts
│   └── policy-evaluation.integration.test.ts
└── e2e/                           # End-to-end tests (full API)
    └── inventory-api.e2e.test.ts
```

## Running Tests

```bash
# Run all tests
pnpm test

# Run only inventory tests
pnpm test -- --testPathPattern=inventory

# Run with coverage
pnpm test -- --coverage --testPathPattern=inventory

# Watch mode
pnpm test:watch -- --testPathPattern=inventory

# Run specific test file
pnpm test -- stock-item.use-case.test

# Run specific test suite
pnpm test -- -t "CreateStockItemUseCase"
```

## Test Status

### ✅ Completed Unit Tests

1. **Event Handlers (event-handlers.test.ts)** - PASSING
   - SaleFinalizedHandler: Deduction with policy checking
   - SaleVoidedHandler: Inventory restoration
   - Covers policy scenarios: excluded items, branch overrides, tenant defaults
   - **15 tests passing**

### ⚠️ Unit Tests with Issues (Need Fixing)

2. **Stock Item Use Cases (stock-item.use-case.test.ts)**

   - Issues:
     - GetStockItemsUseCase signature mismatch (single input object, not multiple params)
     - Mock repository needs `findByTenantAndActive` method
     - Return type is `{items, nextPage}`, not `Result<>`
   - **3 tests failing, 3 tests passing**

3. **Inventory Journal Use Cases (inventory-journal.use-case.test.ts)**

   - Issues:
     - Mock needs `findByBranchAndItem` method (not `findByBranchAndStockItem`)
   - **5 tests failing**

4. **Menu Stock Map Use Cases (menu-stock-map.use-case.test.ts)**

   - Issues:
     - Module path resolution (use case files in subdirectories)
   - **All tests failing (module not found)**

5. **Store Policy Use Cases (store-policy.use-case.test.ts)**

   - Issues:
     - Module path resolution
   - **All tests failing (module not found)**

6. **Branch Stock Use Cases (branch-stock.use-case.test.ts)**
   - Issues:
     - Module path resolution
   - **All tests failing (module not found)**

### 📝 Integration Tests (Not Started)

7. **Stock Operations Integration Tests**

   - Test database operations with real PostgreSQL
   - Test transactions and rollbacks
   - Test on-hand balance calculations

8. **Event Flow Integration Tests**

   - Publish events through outbox
   - Verify handlers execute
   - Check database state after events

9. **Policy Evaluation Integration Tests**
   - Test policy evaluation with real data
   - Test branch overrides
   - Test excluded items

### 📝 End-to-End Tests (Not Started)

10. **Inventory API E2E Tests**
    - HTTP requests to all 25 endpoints
    - Test full workflows
    - Test authentication and authorization
    - Test error handling

## Quick Fixes Needed

### 1. Fix Module Path Resolution

The use case import paths need to match the actual directory structure:

**Current (incorrect):**

```typescript
import { SetMenuStockMapUseCase } from "../../app/use-cases/set-menu-stock-map.use-case.js";
```

**Should be:**

```typescript
import { SetMenuStockMapUseCase } from "../../app/menustockmap-usecase/set-menu-stock-map.use-case.js";
```

**Directory structure:**

```
app/
├── branchstock-usecase/
├── event-handlers/
├── inventoryjournal-usecase/
├── menustockmap-usecase/
├── stockitem-usecase/
└── storepolicyinventory-usecase/
```

### 2. Fix GetStockItemsUseCase Tests

**Current (incorrect):**

```typescript
const result = await useCase.execute("tenant-1", {});
expect(result.ok).toBe(true);
expect(result.value.items.length).toBe(2);
```

**Should be:**

```typescript
const result = await useCase.execute({ tenantId: "tenant-1" });
expect(result.items.length).toBe(2);
expect(result.items[0].name).toBe("Flour");
```

### 3. Add Missing Mock Methods

**BranchStockRepository mock needs:**

```typescript
mockBranchStockRepo = {
  findByBranch: jest.fn(),
  findByBranchAndItem: jest.fn(), // ADD THIS
  updateBalance: jest.fn(),
};
```

**StockItemRepository mock needs:**

```typescript
mockRepo = {
  save: jest.fn(),
  update: jest.fn(),
  findById: jest.fn(),
  findByTenantAndActive: jest.fn(), // ADD THIS
};
```

## Test Patterns

### Unit Test Pattern (with Mocks)

```typescript
describe("UseCase", () => {
  let mockRepo: any;
  let useCase: UseCase;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      save: jest.fn(),
    };
    useCase = new UseCase(mockRepo);
  });

  it("should do something", async () => {
    // Arrange
    mockRepo.findById.mockResolvedValue({ id: "1", name: "Test" });

    // Act
    const result = await useCase.execute({ id: "1" });

    // Assert
    expect(result.ok).toBe(true);
    expect(mockRepo.findById).toHaveBeenCalledWith("1");
  });
});
```

### Integration Test Pattern (with Real DB)

```typescript
describe("Stock Operations Integration", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({
      /* test database config */
    });
    await pool.query("BEGIN"); // Start transaction
  });

  afterAll(async () => {
    await pool.query("ROLLBACK"); // Rollback transaction
    await pool.end();
  });

  it("should create and retrieve stock item", async () => {
    const repo = new StockItemRepository(pool);

    // Create
    const item = await repo.save({
      tenantId: "test-tenant",
      name: "Flour",
      unitText: "kg",
      isActive: true,
    });

    // Retrieve
    const retrieved = await repo.findById(item.id);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.name).toBe("Flour");
  });
});
```

### E2E Test Pattern (with API Calls)

```typescript
describe("Inventory API E2E", () => {
  let authToken: string;

  beforeAll(async () => {
    authToken = await loginAndGetToken();
  });

  it("should create stock item via API", async () => {
    const response = await fetch(
      "http://localhost:3000/api/inventory/stock-items",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Flour",
          unitText: "kg",
          isActive: true,
        }),
      }
    );

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.name).toBe("Flour");
  });
});
```

## Coverage Goals

- **Unit Tests:** 80%+ coverage of use cases and handlers
- **Integration Tests:** Cover all repository methods and database operations
- **E2E Tests:** Cover all critical user workflows

## Next Steps

1. **Fix existing unit tests** (fix import paths, mock methods, assertions)
2. **Create integration test setup** (test database, migrations)
3. **Write integration tests** (repositories, event flow)
4. **Create E2E test setup** (test server, test data)
5. **Write E2E tests** (API endpoints, workflows)
6. **Set up CI/CD** (run tests on every commit)

## Troubleshooting

### PowerShell Execution Policy Error

If you get `UnauthorizedAccess` when running pnpm:

```powershell
# Run directly with node
node --experimental-vm-modules ./node_modules/jest/bin/jest.js

# Or change execution policy (requires admin)
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### Module Resolution Errors

If you get `Could not locate module` errors:

1. Check the actual directory structure under `app/`
2. Update import paths to match (e.g., `menustockmap-usecase` not `use-cases`)
3. Ensure `.js` extension in imports

### Mock Method Errors

If you get `not a function` errors:

1. Check the actual repository interface
2. Add missing methods to your mock object
3. Verify method names match exactly (e.g., `findByBranchAndItem` not `findByBranchAndStockItem`)

## Resources

- Jest Documentation: https://jestjs.io/
- Testing Best Practices: https://testingjavascript.com/
- VS Code Test Explorer: Use `Testing` view in sidebar
