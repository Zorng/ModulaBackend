# KHQR Payment Foundation Rollout (v0)

Status: Baseline completed (K1-K6 completed)  
Owner: backend  
Scope: Platform foundation consumed by `sale-order` finalize flow

## Goal

Ship a minimal but real KHQR payment foundation so sale-order can enforce:
- `KHQR generated` is not payment truth
- sale finalize is allowed only after backend-confirmed payment proof
- deterministic failure codes for missing/mismatched confirmation

This is a foundation phase, not full billing/payment platform completion.

## Primary KB references

- `knowledge_base/BusinessLogic/4_process/30_POSOperation/05_khqr_payment_confirmation_process.md`
- `knowledge_base/BusinessLogic/4_process/30_POSOperation/10_finalize_sale_orch.md`
- `knowledge_base/BusinessLogic/5_modSpec/40_POSOperation/sale_module_patched.md`
- `knowledge_base/BusinessLogic/2_domain/40_POSOperation/payment_domain.md`
- `knowledge_base/BusinessLogic/5_modSpec/60_PlatformSystems/webhookGateway_module.md`
- `knowledge_base/BusinessLogic/5_modSpec/60_PlatformSystems/jobScheduler_module.md`

## Locked rollout strategy

### K1 — Contract lock (manual-confirm baseline)
- Draft/lock `api_contract/khqr-payment-v0.md`:
  - register attempt
  - query/confirm by `md5`
  - deterministic confirmation status model
- Lock sale-order dependency fields:
  - finalize input requires KHQR reference (`md5`/attempt id)
  - finalize denial codes for unconfirmed/mismatched proof

### K2 — Data model + repository
- Add payment attempt and confirmation evidence tables:
  - attempt state (`WAITING_FOR_PAYMENT`, `PAID_CONFIRMED`, `EXPIRED`, `SUPERSEDED`, `PENDING_CONFIRMATION`)
  - expected amount/currency/receiver snapshot
  - provider proof snapshot and verification result
- Enforce idempotency and uniqueness on attempt identity and provider references.

### K3 — Backend confirmation service (no webhook yet)
- Implement provider adapter interface + stub/dev adapter.
- Implement confirmation endpoint flow using backend-only provider call.
- Return deterministic outcomes for:
  - unpaid
  - paid + proof match
  - paid + proof mismatch
  - unknown/expired attempt

### K4 — Sale-order integration gate
- Wire finalize-sale precondition to KHQR confirmation truth.
- Reject finalize when proof is missing or mismatch.
- Preserve atomic command contract (`business + audit + outbox + sync`) on finalize.

### K5 — Webhook ingestion integration (phase-2 extension)
- Consume provider webhooks via webhook gateway.
- Idempotent ingest + dispatch into KHQR attempt state transitions.
- Emit operational notifications for unmatched/mismatched/superseded payments.

### K6 — Reconciliation scheduler (phase-2 extension)
- Add background re-check for pending attempts and missed webhook cases.
- Ensure eventual transition to terminal attempt status.

## Deliverables

- `api_contract/khqr-payment-v0.md`
- KHQR payment foundation module under `src/modules/v0/platformSystem/`
- Integration tests:
  - confirm success/mismatch/unpaid
  - finalize blocked until confirmed
  - finalize with confirmed proof succeeds once (idempotent)

## Exit criteria

- Sale-order rollout can implement KHQR finalize path without placeholder logic.
- Frontend can perform KHQR generate → wait/confirm → finalize flow against backend truth.
- Webhook/scheduler are explicitly marked deferred or completed with no ambiguity.

## Tracking

| Phase | Status | Notes |
|---|---|---|
| K1 Contract lock | Completed | Drafted and locked `api_contract/khqr-payment-v0.md` including attempt lifecycle, confirm-by-md5 flow, and sale-order dependency denial codes. |
| K2 Data model + repository | Completed | Added `migrations/034_create_v0_khqr_payment_tables.sql` (`v0_khqr_payment_attempts`, `v0_khqr_payment_confirmation_evidences`) and repository scaffolding in `src/modules/v0/platformSystem/khqrPayment/infra/repository.ts`. |
| K3 Backend confirmation service | Completed | Implemented KHQR provider adapter (`StubV0KhqrPaymentProvider`), service orchestration, and `/v0/payments/khqr` router endpoints for register/read/confirm flows with idempotent POST behavior. |
| K4 Sale-order integration gate | Completed | Wired KHQR finalize precondition into `pushSync` `sale.finalize` replay seam with deterministic denial codes (`SALE_FINALIZE_KHQR_CONFIRMATION_REQUIRED`, `SALE_FINALIZE_KHQR_PROOF_MISMATCH`) before fallback unsupported handler. |
| K5 Webhook ingestion integration | Completed | Added open webhook endpoint `POST /v0/payments/khqr/webhooks/provider` with provider-secret verification, idempotent provider-event ingestion (`provider_event_id` dedupe), transactional attempt state transitions, and mismatch detection on confirmed proofs. |
| K6 Reconciliation scheduler | Completed | Added background reconciliation dispatcher (`startV0KhqrReconciliationDispatcher`) that periodically re-verifies `WAITING_FOR_PAYMENT` and `PENDING_CONFIRMATION` attempts, marks expired attempts, and drives eventual terminal state convergence. |
