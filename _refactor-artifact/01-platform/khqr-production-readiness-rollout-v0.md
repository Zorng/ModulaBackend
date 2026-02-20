# KHQR Production Readiness Rollout (v0)

Status: **In Progress (P0)**

Owner: backend  
Started: 2026-02-20

## Goal

Close the remaining production gaps between current KHQR foundation and real checkout operation:

1. backend owns branch-level merchant receiver resolution
2. backend owns KHQR request generation contract
3. sale finalize remains gated by backend confirmation truth
4. provider adapter can be switched from stub to real provider without API rewiring

## Scope

In scope:
- KHQR server-side generation + registration flow
- branch payment account source-of-truth and guardrails
- contract + ACL + route registration alignment
- integration coverage for end-to-end sale KHQR happy path and failure paths

Out of scope:
- full external provider onboarding runbook
- payment disputes/refunds
- non-KHQR payment rails

## Phase Plan

### P0.1 — Branch Payment Account Source of Truth
- Add branch-level KHQR merchant account fields in OrgAccount data model.
- Expose/consume branch-level receiver account in backend only.
- Remove client authority over `toAccountId` for KHQR attempt creation.

Exit criteria:
- Attempt registration resolves `toAccountId` from branch profile, not request body.
- Missing branch KHQR account returns deterministic error.

### P0.2 — Backend KHQR Generation Endpoint
- Add dedicated endpoint to generate payment request for a pending KHQR sale.
- Server derives sale amount/currency from sale snapshot and branch receiver account.
- Generation returns attempt identity (`md5`), expiry, and renderable payload string.

Exit criteria:
- Frontend can call one backend endpoint to generate KHQR for sale checkout.
- Regeneration creates superseding attempt cleanly.

### P0.3 — Sale Gate Tightening
- Keep existing finalize gate and verify against generated/registered attempt.
- Ensure deny codes remain deterministic:
  - `SALE_FINALIZE_KHQR_CONFIRMATION_REQUIRED`
  - `SALE_FINALIZE_KHQR_PROOF_MISMATCH`

Exit criteria:
- Finalize cannot pass without confirmed proof for matching sale attempt.

### P1 — Real Provider Adapter
- Implement non-stub provider adapter behind `V0_KHQR_PROVIDER`.
- Keep router/service contract unchanged.
- Validate webhook signature + provider verification mapping.

Exit criteria:
- Provider switch no longer forced to stub when `V0_KHQR_PROVIDER != stub`.

### P2 — Realtime UX Signal
- Add operational event push (SSE) for KHQR payment status transitions.
- Keep polling fallback.

Exit criteria:
- Cashier can observe payment completion without manual refresh loop.

## Delivery Checklist (Current Sprint)

- [x] migration for branch KHQR receiver account
- [x] KHQR router/service changes for server-owned receiver resolution
- [x] KHQR generate endpoint (sale-scoped)
- [x] access-control route/action catalog updates
- [x] `api_contract/khqr-payment-v0.md` update
- [x] integration tests for sale KHQR generate + confirm + finalize

## Tracking

| Phase | Status | Notes |
|---|---|---|
| P0.1 Branch payment account | Completed | Added branch KHQR receiver fields + org endpoint to configure branch receiver account. |
| P0.2 Backend generation endpoint | Completed | Added `POST /v0/payments/khqr/sales/:saleId/generate` with server-owned receiver resolution and attempt registration. |
| P0.3 Sale gate tightening | Completed | Existing finalize gate validated by integration flow (generate -> webhook confirm -> finalize). |
| P1 Real provider adapter | In Progress | Added `bakong`/`bakong_http` HTTP adapter + env-based provider selection; pending live provider endpoint validation. |
| P2 Realtime UX signal | Pending | SSE extension after P0/P1 stabilization. |
