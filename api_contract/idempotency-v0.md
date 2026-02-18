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

## Internal Flow (How It Works)

Implementation references:
- `src/platform/idempotency/service.ts`
- `src/platform/idempotency/repository.ts`
- `migrations/013_create_v0_idempotency_records.sql`

At request time:
1. Backend reads `Idempotency-Key` from header.
2. Backend computes:
   - `scope_fingerprint = tenantId::branchId` (or `tenantId::-` for tenant scope)
   - `payload_hash = sha256(stable-json(payload))`
3. Backend tries to insert a `PROCESSING` record in `v0_idempotency_records`.
4. If insert succeeds (first writer):
   - handler runs
   - response is persisted (`response_status`, `response_body`)
   - row marked `COMPLETED`
5. If row already exists:
   - payload hash mismatch -> `IDEMPOTENCY_CONFLICT`
   - same hash + `COMPLETED` -> replay stored response (`Idempotency-Replayed: true`)
   - same hash + `PROCESSING` -> `IDEMPOTENCY_IN_PROGRESS`

Key technical note:
- Deduplication uniqueness is enforced by DB constraint:
  - `UNIQUE(scope_fingerprint, action_key, idempotency_key)`

## Separation From Business Constraints

Idempotency prevents duplicate command execution.
It does **not** replace business uniqueness rules.

Example:
- Menu category creation still enforces DB unique name per tenant:
  - `v0_menu_categories(tenant_id, name)` unique

So:
- new idempotency key + existing category name -> business duplicate error
- same idempotency key + same payload -> replayed success (no second insert)

## Postman Troubleshooting

If server logs show `idempotencyKey: "{{idempotencyKey}}"`, the variable was not resolved.

Recommended collection pre-request script:

```javascript
const key = pm.variables.replaceIn("{{$guid}}");
pm.request.headers.upsert({
  key: "Idempotency-Key",
  value: key
});
```

This avoids unresolved-variable UI issues and guarantees a runtime header value.
