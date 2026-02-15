# Idempotency (`/v0`) — Contract Notes

This document defines shared idempotency behavior for write endpoints that opt into the idempotency gate.

## Request Convention

- Header: `Idempotency-Key: <client generated key>`
- The same logical write retry must reuse the same key.

## Scope Tuple

Idempotency records are scoped by:
- `tenantId`
- `branchId` (for branch-scoped actions)
- `actionKey`
- `idempotencyKey`

Payload hash is also recorded to detect conflicts.

## Outcomes

- `APPLY`:
  - First request with a key is executed.
- `DUPLICATE`:
  - Same key + same payload returns stored prior response.
  - Response includes header: `Idempotency-Replayed: true`
- `CONFLICT`:
  - Same key + different payload
  - Error code: `IDEMPOTENCY_CONFLICT`

## Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| `IDEMPOTENCY_KEY_REQUIRED` | 422 | Write endpoint requires `Idempotency-Key` header. |
| `IDEMPOTENCY_CONFLICT` | 409 | Key was reused with different payload hash. |
| `IDEMPOTENCY_IN_PROGRESS` | 409 | Same key is currently being processed by another in-flight request. |
