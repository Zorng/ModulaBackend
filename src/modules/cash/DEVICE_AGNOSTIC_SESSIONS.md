# Cash Session Device-Agnostic Support - Implementation Summary

## Overview

Implemented support for device-agnostic cash sessions to enable web browsers and mobile apps to manage cash sessions without requiring physical register/terminal configuration.

## Problem Solved

**Before:**

- All cash session operations required a `registerId`
- Web browsers had to fabricate "Default Register" entries
- Frontend had to implement workarounds for session state tracking
- `/v1/cash/sessions/active?registerId=...` returned 404 for web clients

**After:**

- `registerId` is now **optional** for all session operations
- Web/mobile clients can open branch-level sessions without register management
- Backend properly tracks session state for device-agnostic clients
- Both register-based and device-agnostic sessions coexist seamlessly

## Changes Made

### 1. Domain Layer

**File:** `src/modules/cash/domain/entities.ts`

- Made `registerId` optional in `CashSession` interface
- Made `registerId` optional in `CashMovement` interface

**File:** `src/modules/cash/domain/repositories.ts`

- Added `findOpenByBranch(tenantId, branchId)` method to `CashSessionRepository` interface

### 2. Infrastructure Layer

**File:** `src/modules/cash/infra/repository.ts`

- Implemented `findOpenByBranch()` to query for open device-agnostic sessions
- Query: `WHERE tenant_id = $1 AND branch_id = $2 AND status = 'OPEN' AND register_id IS NULL`

### 3. Application Layer (Use Cases)

**File:** `src/modules/cash/app/open-cash-sess.usecase.ts`

- Made `registerId` optional in `OpenCashSessionInput`
- Added logic to check for existing branch-level sessions when `registerId` is omitted
- Validates register only if `registerId` is provided

**File:** `src/modules/cash/app/take-over-sess.usecase.ts`

- Made `registerId` optional in `TakeOverSessionInput`
- Finds existing session by register (if provided) or by branch

**File:** `src/modules/cash/app/get-active-session.usecase.ts`

- Made `registerId` optional in `GetActiveSessionInput`
- Added `tenantId` and `branchId` to input
- Queries by register if provided, otherwise queries branch-level session

### 4. API Layer

**File:** `src/modules/cash/api/dto/index.ts`

- Made `registerId` optional in all DTOs:
  - `openSessionBodySchema` and `openSessionSchema`
  - `takeOverSessionBodySchema` and `takeOverSessionSchema`
  - `recordMovementSchema`
  - `getActiveSessionQuerySchema`

**File:** `src/modules/cash/api/controller/session/session.controller.ts`

- Updated `getActiveSession()` to handle optional `registerId`
- Extracts `tenantId` and `branchId` from authenticated user context
- Returns appropriate error messages for register vs branch lookups

### 5. Database Migration

**File:** `migrations/018_make_register_id_nullable.sql`

- Made `register_id` nullable in `cash_sessions` table
- Made `register_id` nullable in `cash_movements` table
- Dropped old unique constraint: `unique_open_session`
- Added two new partial unique indexes:
  - `unique_open_session_no_register`: Ensures only one OPEN device-agnostic session per (tenant, branch)
  - `unique_open_session_with_register`: Ensures only one OPEN session per (tenant, register) when register is specified

### 6. Documentation

**File:** `src/modules/cash/API_DOCUMENTATION.md`

- Updated overview to explain both session types
- Documented optional `registerId` in all relevant endpoints
- Added comprehensive "Session Types" section explaining:
  - Register-based sessions (traditional POS)
  - Device-agnostic sessions (web/mobile)
  - Use cases for each approach
  - Constraints and behaviors

## API Changes

### Opening a Session

**Register-based (before and after):**

```json
POST /v1/cash/sessions
{
  "registerId": "uuid",
  "openingFloatUsd": 100.0,
  "openingFloatKhr": 400000
}
```

**Device-agnostic (NEW):**

```json
POST /v1/cash/sessions
{
  "openingFloatUsd": 100.0,
  "openingFloatKhr": 400000
}
```

### Getting Active Session

**Register-based:**

```
GET /v1/cash/sessions/active?registerId=abc-123-uuid
```

**Device-agnostic (NEW):**

```
GET /v1/cash/sessions/active
```

## Session Constraints

### Register-Based Sessions

- Only one OPEN session per register at a time
- Register must exist and be ACTIVE
- Multiple registers can have concurrent sessions in the same branch

### Device-Agnostic Sessions

- Only one OPEN device-agnostic session per branch at a time
- Uses authenticated user's tenant/branch automatically
- No register management required

## Frontend Benefits

Web and mobile clients can now:

1. ✅ Open sessions without creating dummy registers
2. ✅ Fetch active session using just `GET /v1/cash/sessions/active`
3. ✅ Remove all register-related workarounds
4. ✅ Rely on backend for session state (no frontend-only state)
5. ✅ Properly block sales when no session is active (backend-enforced)

## Migration Instructions

1. **Run the migration:**

   ```bash
   pnpm migrate
   ```

2. **Update frontend code:**

   - Remove `registerId` from session open requests
   - Remove `registerId` query parameter from active session checks
   - Remove any "Default Register" creation logic
   - Update session state management to rely on backend responses

3. **Testing:**
   - Test opening device-agnostic session
   - Verify only one device-agnostic session can be open per branch
   - Test register-based sessions still work (backward compatible)
   - Verify concurrent register-based sessions work in same branch
   - Test takeover for both session types

## Backward Compatibility

✅ **Fully backward compatible**

- Existing register-based sessions continue to work unchanged
- Clients providing `registerId` behave exactly as before
- No breaking changes to existing API contracts

## Related Files

- Domain: `src/modules/cash/domain/entities.ts`, `repositories.ts`
- Use Cases: `src/modules/cash/app/open-cash-sess.usecase.ts`, `take-over-sess.usecase.ts`, `get-active-session.usecase.ts`
- Repository: `src/modules/cash/infra/repository.ts`
- API: `src/modules/cash/api/dto/index.ts`, `api/controller/session/session.controller.ts`
- Migration: `migrations/018_make_register_id_nullable.sql`
- Docs: `src/modules/cash/API_DOCUMENTATION.md`
