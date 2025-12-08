# Technical Implementation Details: Device-Agnostic Cash Sessions

## Database Schema Changes

### Before

```sql
CREATE TABLE cash_sessions (
    register_id UUID NOT NULL REFERENCES cash_registers(id) ON DELETE CASCADE,
    -- ... other fields
);

CREATE TABLE cash_movements (
    register_id UUID NOT NULL REFERENCES cash_registers(id) ON DELETE CASCADE,
    -- ... other fields
);

-- Single unique constraint
CREATE UNIQUE INDEX unique_open_session
    ON cash_sessions (tenant_id, register_id)
    WHERE status = 'OPEN';
```

### After

```sql
CREATE TABLE cash_sessions (
    register_id UUID NULL REFERENCES cash_registers(id) ON DELETE CASCADE,
    -- ... other fields
);

CREATE TABLE cash_movements (
    register_id UUID NULL REFERENCES cash_registers(id) ON DELETE CASCADE,
    -- ... other fields
);

-- Two separate unique constraints for different use cases
CREATE UNIQUE INDEX unique_open_session_no_register
    ON cash_sessions (tenant_id, branch_id)
    WHERE status = 'OPEN' AND register_id IS NULL;

CREATE UNIQUE INDEX unique_open_session_with_register
    ON cash_sessions (tenant_id, register_id)
    WHERE status = 'OPEN' AND register_id IS NOT NULL;
```

## Session Isolation Strategy

The system uses **partial unique indexes** to enforce business rules:

### Device-Agnostic Sessions

- Constraint: `unique_open_session_no_register`
- Ensures: Only ONE open session per `(tenant_id, branch_id)` when `register_id IS NULL`
- Use case: Web/mobile clients sharing a branch-level session

### Register-Based Sessions

- Constraint: `unique_open_session_with_register`
- Ensures: Only ONE open session per `(tenant_id, register_id)` when `register_id IS NOT NULL`
- Use case: Multiple physical terminals operating independently

### Coexistence Example

A branch can have:

- ✅ One device-agnostic session (register_id = NULL)
- ✅ Multiple register-based sessions (register_id = UUID1, UUID2, UUID3)
- ❌ Two device-agnostic sessions (blocked by constraint)
- ❌ Two sessions on same register (blocked by constraint)

## Query Patterns

### Finding Open Sessions

**Register-specific:**

```typescript
findOpenByRegister(registerId: string): Promise<CashSession | null>
```

```sql
SELECT * FROM cash_sessions
WHERE register_id = $1 AND status = 'OPEN'
```

**Branch-level (device-agnostic):**

```typescript
findOpenByBranch(tenantId: string, branchId: string): Promise<CashSession | null>
```

```sql
SELECT * FROM cash_sessions
WHERE tenant_id = $1
  AND branch_id = $2
  AND status = 'OPEN'
  AND register_id IS NULL
ORDER BY opened_at DESC
LIMIT 1
```

## Type System Changes

### Domain Types

```typescript
// Before
interface CashSession {
  registerId: string; // Always required
}

// After
interface CashSession {
  registerId?: string; // Optional
}
```

### Input Validation

```typescript
// Zod schema - now optional
const openSessionBodySchema = z.object({
  registerId: uuidSchema.optional(), // Was: uuidSchema (required)
  openingFloatUsd: nonNegativeNumber,
  openingFloatKhr: nonNegativeNumber,
  note: z.string().max(500).optional(),
});
```

## Use Case Logic Flow

### Opening a Session

```typescript
async execute(input: OpenCashSessionInput): Promise<Result<CashSession, string>> {
  if (input.registerId) {
    // Register-based session
    const register = await this.registerRepo.findById(input.registerId);
    if (!register) return Err("Register not found");
    if (register.status !== "ACTIVE") return Err("Register is not active");

    // Check for existing session on this register
    const existing = await this.sessionRepo.findOpenByRegister(input.registerId);
    if (existing) return Err("Session already open on this register");
  } else {
    // Device-agnostic session
    // Check for existing branch-level session
    const existing = await this.sessionRepo.findOpenByBranch(
      input.tenantId,
      input.branchId
    );
    if (existing) return Err("Session already open for this branch");
  }

  // Create session (registerId may be null)
  const session = await this.sessionRepo.save({
    ...input,
    registerId: input.registerId ?? null, // Explicitly set null if omitted
  });

  return Ok(session);
}
```

### Getting Active Session

```typescript
async execute(input: GetActiveSessionInput): Promise<Result<CashSession | null, string>> {
  const session = input.registerId
    ? await this.sessionRepo.findOpenByRegister(input.registerId)
    : await this.sessionRepo.findOpenByBranch(input.tenantId, input.branchId);

  if (!session) return Ok(null);

  // Attach movements
  const movements = await this.movementRepo.findBySession(session.id);
  session.movements = movements;

  return Ok(session);
}
```

## API Layer Changes

### Controller Parameter Resolution

**Before:**

```typescript
async getActiveSession(req: AuthRequest, res: Response) {
  const { registerId } = req.query;

  if (!registerId) {
    return res.status(400).json({ error: "registerId required" });
  }

  const result = await this.useCase.execute({ registerId });
}
```

**After:**

```typescript
async getActiveSession(req: AuthRequest, res: Response) {
  const { registerId } = req.query;

  const result = await this.useCase.execute({
    tenantId: req.user!.tenantId,     // From JWT token
    branchId: req.user!.branchId,     // From JWT token
    registerId: registerId || undefined, // Optional from query
  });
}
```

## Event Publishing

Events remain the same structure but `registerId` may be null:

```typescript
const event: CashSessionOpenedV1 = {
  type: "cash.session_opened",
  v: 1,
  tenantId,
  branchId,
  sessionId: session.id,
  registerId: session.registerId ?? null, // May be null
  openedBy,
  openingFloat: openingFloatUsd,
  openedAt: session.openedAt.toISOString(),
};
```

## Testing Scenarios

### Unit Tests

```typescript
describe('OpenCashSessionUseCase', () => {
  it('should open device-agnostic session without registerId', async () => {
    const result = await useCase.execute({
      tenantId: 'tenant1',
      branchId: 'branch1',
      // registerId omitted
      openedBy: 'user1',
      openingFloatUsd: 100,
      openingFloatKhr: 400000,
    });

    expect(result.ok).toBe(true);
    expect(result.value.registerId).toBeUndefined();
  });

  it('should prevent multiple device-agnostic sessions', async () => {
    // Open first session
    await useCase.execute({ tenantId: 'tenant1', branchId: 'branch1', ... });

    // Try to open second session - should fail
    const result = await useCase.execute({ tenantId: 'tenant1', branchId: 'branch1', ... });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('already open');
  });
});
```

### Integration Tests

```typescript
describe("Cash Session API", () => {
  it("GET /v1/cash/sessions/active without registerId", async () => {
    const response = await request(app)
      .get("/v1/cash/sessions/active")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("POST /v1/cash/sessions without registerId", async () => {
    const response = await request(app)
      .post("/v1/cash/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        openingFloatUsd: 100,
        openingFloatKhr: 400000,
      });

    expect(response.status).toBe(201);
    expect(response.body.data.registerId).toBeNull();
  });
});
```

## Performance Considerations

### Index Usage

Both partial unique indexes use the same columns that are queried:

- `unique_open_session_no_register`: Uses `(tenant_id, branch_id, status)`
- `unique_open_session_with_register`: Uses `(tenant_id, register_id, status)`

Queries are optimized to use these indexes directly.

### Query Performance

```sql
-- Device-agnostic lookup (uses partial index)
EXPLAIN SELECT * FROM cash_sessions
WHERE tenant_id = 'xxx'
  AND branch_id = 'yyy'
  AND status = 'OPEN'
  AND register_id IS NULL;
-- Uses: unique_open_session_no_register

-- Register lookup (uses partial index)
EXPLAIN SELECT * FROM cash_sessions
WHERE register_id = 'zzz'
  AND status = 'OPEN';
-- Uses: unique_open_session_with_register
```

## Security Considerations

### Tenant Isolation

- All queries include `tenant_id` filter
- JWTtoken provides authenticated user's tenant/branch
- No cross-tenant session access possible

### Authorization

- Session operations require valid JWT token
- Take-over requires Manager/Admin role
- Session closure requires being the opener or Manager/Admin

### Data Integrity

- Foreign key constraints preserved (nullable but still referenced)
- Unique constraints prevent conflicting sessions
- Status transitions enforced at application level

## Migration Safety

### Zero Downtime

The migration can be run without downtime:

1. `ALTER COLUMN` changes are metadata-only (no table rewrite)
2. `DROP INDEX` is instant
3. `CREATE INDEX` is concurrent-safe

### Rollback Plan

```sql
-- If needed, revert the changes
ALTER TABLE cash_sessions ALTER COLUMN register_id SET NOT NULL;
ALTER TABLE cash_movements ALTER COLUMN register_id SET NOT NULL;

DROP INDEX unique_open_session_no_register;
DROP INDEX unique_open_session_with_register;

CREATE UNIQUE INDEX unique_open_session
    ON cash_sessions (tenant_id, register_id)
    WHERE status = 'OPEN';
```

## Monitoring & Observability

### Metrics to Track

- Count of device-agnostic vs register-based sessions
- Average session duration by type
- Variance rates by session type
- Takeover frequency

### Logging

```typescript
logger.info("Session opened", {
  sessionId: session.id,
  type: session.registerId ? "register-based" : "device-agnostic",
  tenantId: session.tenantId,
  branchId: session.branchId,
});
```

## Future Enhancements

### Potential Extensions

1. **Auto-provision default register**: Backend creates virtual register on first web session
2. **Session handoff**: Transfer device-agnostic session to specific register
3. **Multi-user sessions**: Allow multiple users on same device-agnostic session
4. **Session templates**: Pre-configured opening floats by branch
5. **Session scheduling**: Auto-open sessions at configured times
