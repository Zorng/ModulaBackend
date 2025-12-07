# Cash Module - Policy Integration

## Overview

The Cash module is fully integrated with the Policy module to enforce tenant-level cash handling rules. This ensures that cash operations comply with business policies configured in the admin panel.

## Policy Integration Points

### 1. **Require Cash Session to Sell**
- **Policy**: `cashRequireSessionForSales`
- **Impact**: When enabled, sales with cash payment require an open cash session
- **Implementation**: Enforced at sales finalization level
- **Default**: `true` (for security)

### 2. **Allow Paid-Out**
- **Policy**: `cashAllowPaidOut`
- **Impact**: Controls whether cashiers can record paid-out transactions (petty cash)
- **Implementation**: Checked in `RecordCashMovementUseCase` for `PAID_OUT` type
- **Default**: `true`
- **Error**: `"Paid-out operations are not allowed by tenant policy"`

### 3. **Cash Refund Approval**
- **Policy**: `cashRequireRefundApproval`
- **Impact**: When enabled, cash refunds require manager approval (status: PENDING)
- **Implementation**: Checked in `RecordCashMovementUseCase` for `REFUND_CASH` type
- **Default**: `true` (for security)
- **Behavior**: Creates movement with `status: PENDING` instead of `APPROVED`

### 4. **Manual Cash Adjustment**
- **Policy**: `cashAllowManualAdjustment`
- **Impact**: Controls whether managers can manually adjust cash amounts
- **Implementation**: Checked in `RecordCashMovementUseCase` for `ADJUSTMENT` type
- **Default**: `false` (for audit integrity)
- **Error**: `"Manual adjustments are not allowed by tenant policy"`

### 5. **Paid-Out Limits**
- **Policy**: Hardcoded limits (future: configurable in DB)
- **Current Limits**:
  - USD: $500
  - KHR: 2,000,000
- **Impact**: Paid-out amounts exceeding limits require manager approval
- **Implementation**: Checked before creating approved PAID_OUT movements
- **Error**: `"Paid-out amount exceeds limit ($500 USD / 2000000 KHR). Manager approval required."`

## Architecture

### Policy Service Layer

```typescript
CashPolicyService (interface)
├── PolicyBasedCashPolicyService (production)
│   └── Uses PgPolicyRepository to query cash_session_policies table
└── DefaultCashPolicyService (testing/fallback)
    └── Returns safe defaults when policy module unavailable
```

### Integration Flow

```
User Action (e.g., Paid-Out)
    ↓
RecordCashMovementUseCase
    ↓
PolicyService.allowPaidOut(tenantId)
    ↓
PgPolicyRepository.getCashSessionPolicies(tenantId)
    ↓
Query: SELECT * FROM cash_session_policies WHERE tenant_id = ?
    ↓
Return policy value or default
    ↓
Continue or reject based on policy
```

## Database Schema

### cash_session_policies Table

```sql
CREATE TABLE cash_session_policies (
    tenant_id UUID PRIMARY KEY,
    require_session_for_sales BOOLEAN NOT NULL DEFAULT FALSE,
    allow_paid_out BOOLEAN NOT NULL DEFAULT FALSE,
    require_refund_approval BOOLEAN NOT NULL DEFAULT FALSE,
    allow_manual_adjustment BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Policy Enforcement Examples

### Example 1: Paid-Out Denied by Policy

```typescript
// Tenant has disabled paid-out
Policy: { allow_paid_out: false }

// Cashier attempts paid-out
Request: POST /v1/cash/movements
{
  "type": "PAID_OUT",
  "amountUsd": 20,
  "reason": "Supplies"
}

// Response
Status: 400 Bad Request
{
  "success": false,
  "error": "Paid-out operations are not allowed by tenant policy"
}
```

### Example 2: Refund Requires Approval

```typescript
// Tenant requires manager approval for refunds
Policy: { require_refund_approval: true }

// Cashier records refund
Request: POST /v1/cash/movements
{
  "type": "REFUND_CASH",
  "amountUsd": 15,
  "reason": "Product return"
}

// Response - Movement created but PENDING
Status: 201 Created
{
  "success": true,
  "data": {
    "id": "mov-123",
    "type": "REFUND_CASH",
    "status": "PENDING",  // ← Requires manager approval
    "amountUsd": 15
  }
}
```

### Example 3: Paid-Out Exceeds Limit

```typescript
// Limit: $500 USD
// Cashier attempts $600 paid-out

Request: POST /v1/cash/movements
{
  "type": "PAID_OUT",
  "amountUsd": 600,
  "reason": "Large purchase"
}

// Response
Status: 400 Bad Request
{
  "success": false,
  "error": "Paid-out amount exceeds limit ($500 USD / 2000000 KHR). Manager approval required."
}

// Solution: Request with approval flag
Request: POST /v1/cash/movements
{
  "type": "PAID_OUT",
  "amountUsd": 600,
  "reason": "Large purchase",
  "requiresApproval": true  // ← Manager will approve later
}

// Response - Movement created as PENDING
Status: 201 Created
{
  "success": true,
  "data": {
    "id": "mov-456",
    "status": "PENDING"
  }
}
```

### Example 4: Adjustment Denied by Policy

```typescript
// Tenant has disabled manual adjustments
Policy: { allow_manual_adjustment: false }

// Manager attempts adjustment
Request: POST /v1/cash/movements
{
  "type": "ADJUSTMENT",
  "amountUsd": -5,
  "reason": "Correction"
}

// Response
Status: 400 Bad Request
{
  "success": false,
  "error": "Manual adjustments are not allowed by tenant policy"
}
```

## Testing

### Unit Tests with Mock Policy Service

```typescript
const policyService = new DefaultCashPolicyService();
const useCase = new RecordCashMovementUseCase(
  sessionRepo,
  movementRepo,
  eventBus,
  txManager,
  policyService  // ← Injected dependency
);
```

### Integration Tests with Real Policy Repository

```typescript
const policyRepo = new PgPolicyRepository(pool);
const policyService = new PolicyBasedCashPolicyService(policyRepo);

// Set up test policies
await pool.query(`
  INSERT INTO cash_session_policies (tenant_id, allow_paid_out)
  VALUES ($1, false)
`, [testTenantId]);

// Test that paid-out is rejected
const result = await recordMovementUseCase.execute({
  tenantId: testTenantId,
  type: "PAID_OUT",
  amountUsd: 20
});

expect(result.ok).toBe(false);
expect(result.error).toContain("not allowed by tenant policy");
```

## Configuration

### Setting Policies via API

```bash
# Update cash session policies
PATCH /v1/policies/tenant/{tenantId}
Content-Type: application/json

{
  "cashAllowPaidOut": true,
  "cashRequireRefundApproval": true,
  "cashAllowManualAdjustment": false
}
```

### Default Policy Values

When a tenant doesn't have custom policies, these defaults are used:

| Policy | Default | Rationale |
|--------|---------|-----------|
| `requireSessionForSales` | `true` | Security: prevent unaccounted cash |
| `allowPaidOut` | `true` | Flexibility: most businesses need this |
| `requireRefundApproval` | `true` | Security: prevent fraud |
| `allowManualAdjustment` | `false` | Audit: keep clean records |

## Future Enhancements

1. **Configurable Limits**: Move paid-out limits to database
2. **Role-Based Policies**: Different limits per role
3. **Time-Based Policies**: Restrict operations by shift/time
4. **Approval Workflow**: Implement manager approval UI
5. **Policy Audit Log**: Track policy changes and who made them

## Related Documentation

- [Cash Module README](./README.md)
- [Cash API Documentation](./API_DOCUMENTATION.md)
- [Policy Module](../policy/README.md)
- [Cash Session Spec](../../context/Cash%20Session%20%26%20Reconciliation.md)
