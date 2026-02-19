# Operational Notification Rollout (v0)

Status: In progress (N1 completed)  
Owner: backend  
Started: 2026-02-19

## Goal

Implement the in-app operational notification baseline from KB so POS modules can emit consistent, idempotent signals without retrofitting later.

## Why now (before Inventory)

- Cash Session already emits business events that should produce operational signals.
- Sale-order/void flows will depend on recipient resolution and dedupe semantics.
- If delayed, each POS module will add ad-hoc notification behavior and create rework.

## Primary KB references

- `knowledge_base/BusinessLogic/5_modSpec/60_PlatformSystems/operationalNotification_module.md`
- `knowledge_base/BusinessLogic/2_domain/60_PlatformSystems/operational_notification_domain.md`
- `knowledge_base/BusinessLogic/4_process/60_PlatformSystems/30_operational_notification_emission_process.md`
- `knowledge_base/BusinessLogic/3_contract/10_edgecases/operational_notification_edge_case_sweep.md`

## Locked baseline scope (v0)

In scope:
- in-app notification records
- recipient resolution by branch/role/access
- unread state + mark-read behavior
- idempotent notification creation via dedupe keys
- best-effort emission (business command success must not depend on notification write success)

Out of scope:
- push/email/SMS channels
- escalation/task assignment
- workflow correctness coupling

## Execution phases

### Phase N1 — Boundary + Contract lock
- lock ownership and consumed seams
- lock notification types and dedupe key patterns
- define action keys + reason code contract
- draft `api_contract/operational-notification-v0.md`

### Phase N2 — Data model + repository
- create tables for notifications + recipients
- add uniqueness constraints for idempotency
- implement repository APIs (insert + inbox reads + read-state updates)

### Phase N3 — Query + command surface
- implement inbox list/read endpoints
- implement unread count endpoint
- implement mark-read command endpoint
- register ACL actions and route metadata

### Phase N4 — Emission integration seams
- integrate producer seam from existing module(s):
  - cash session close event (ON-04 baseline)
- add emitter adapter for future sale void signals (ON-01/02/03)
- enforce best-effort behavior with structured failure telemetry

### Phase N5 — Reliability + close-out
- integration tests for dedupe and recipient correctness
- access-safety tests (no cross-tenant/branch leakage)
- update `_refactor-artifact/01-platform/v0-command-outbox-event-catalog.md`
- finalize contract notes for frontend consumption

## Tracking

| Phase | Status | Notes |
|---|---|---|
| N1 Boundary + Contract lock | Completed | Locked module boundary and API contract: `_refactor-artifact/02-boundary/operational-notification-boundary-v0.md`, `api_contract/operational-notification-v0.md`. |
| N2 Data model + repository | Not started | |
| N3 Query + command surface | Not started | |
| N4 Emission integration seams | Not started | |
| N5 Reliability + close-out | Not started | |
