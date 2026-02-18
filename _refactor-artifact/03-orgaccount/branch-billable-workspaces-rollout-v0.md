# OrgAccount Branch Billable Workspaces Rollout (v0)

Status: Completed  
Owner: backend  
Started: 2026-02-17

## Goal

Extend OrgAccount from first-branch-only activation to billable multi-branch tenancy:
- tenant can run multiple branches,
- each additional branch is a paid branch activation,
- branch activation remains atomic (`business + audit + outbox`).

## Why this exists

Current `/v0/org/branches/activation/*` flow already models payment-gated activation,
but tracking docs still describe "slot/capacity" semantics that are not desired.

## Current behavior (baseline)

- Implemented:
  - `POST /v0/org/branches/activation/initiate`
  - `POST /v0/org/branches/activation/confirm`
- Guard:
  - one `PENDING_PAYMENT` draft per tenant at a time
- Post-confirm:
  - creates branch
  - seeds branch entitlements
  - auto-assigns requester to the new branch

## Target behavior

- Keep current activation flow endpoint shape.
- Treat each branch as a billable workspace unit (no reusable slot abstraction).
- Keep "no unpaid branches" invariant:
  - invoice/draft created first
  - branch provisioned only after payment confirmation
- Use payment/subscription denials (not capacity denials).

## Candidate API surface (planned)

- `POST /v0/org/branches/activation/initiate`
- `POST /v0/org/branches/activation/confirm`
- `GET /v0/org/branches` (tenant-wide branch management list)

Notes:
- Activation endpoints are already implemented.
- Existing `/v0/org/branches/accessible` remains assignment-scoped.

## Phases

### Phase S1 — Contract + Decision Lock
- lock terminology:
  - `branch activation` / `billable workspace`
  - remove `slot` terminology from contracts and trackers
- lock denial code set to payment/subscription-oriented codes
- patch `api_contract/branch-v0.md` with explicit current vs planned scope

### Phase S2 — Data Model
- add branch activation draft typing for first/additional branch
- keep billing anchor rules from KB processes (first branch sets anchor; additional branch does not)
- ensure compatibility with existing first-activation invoice/draft tables

### Phase S3 — Command Implementation
- keep activation commands
- enforce payment verification + auto-assignment + idempotent draft handling
- keep atomic command contract with audit/outbox

### Phase S4 — Access Control + Entitlement Wiring
- add action keys + route registry entries
- add role constraints (OWNER/ADMIN)
- add entitlement/fair-use gates where needed

### Phase S5 — Integration + Reliability
- add integration tests for:
  - first branch and additional branch activation paths
  - no branch provision before payment
  - idempotency replay/conflict
  - rollback on forced outbox failure
  - outbox dispatcher publish verification

### Phase S6 — Close-Out
- update rollout trackers + outbox event catalog
- finalize branch contract and frontend rollout notes

## Tracking

| Phase | Status | Notes |
|---|---|---|
| S1 Contract + Decision Lock | Completed | Slot terminology removed, billable-workspace model locked, API contract + ADR aligned. |
| S2 Data Model | Completed | Added activation typing (`FIRST_BRANCH`/`ADDITIONAL_BRANCH`), invoice typing, and subscription billing anchor timestamp for first paid activation. |
| S3 Command Implementation | Completed | Activation flow supports repeated paid activations, payment-gated confirm, auto-assignment, atomic writes. |
| S4 Access Control + Entitlement Wiring | Completed | Route/action wiring in place; `PAST_DUE` upgrade gating enforced (`SUBSCRIPTION_UPGRADE_REQUIRED`); fair-use branch activation guards added (`FAIRUSE_HARD_LIMIT_EXCEEDED`, `FAIRUSE_RATE_LIMITED`). |
| S5 Integration + Reliability | Completed | Added coverage for idempotency replay/conflict (initiate+confirm), forced outbox-failure rollback with idempotency cleanup, and outbox dispatcher publish verification for branch activation events. |
| S6 Close-Out | Completed | Tracker/index/orgaccount plan aligned, outbox catalog verified, branch API contract finalized for activation typing + idempotency + denial codes. |

## Close-Out Summary

- Branch monetization model locked as **billable workspace** (no reusable slot abstraction).
- Branch activation flow supports both:
  - first branch activation (`activationType = FIRST_BRANCH`)
  - additional branch activation (`activationType = ADDITIONAL_BRANCH`)
- Billing anchor is set on first paid activation only.
- Access-control and guard rails:
  - `SUBSCRIPTION_UPGRADE_REQUIRED` for upgrade actions in `PAST_DUE`
  - `SUBSCRIPTION_FROZEN` for write actions in `FROZEN`
  - fair-use protection on activation initiate:
    - `FAIRUSE_HARD_LIMIT_EXCEEDED`
    - `FAIRUSE_RATE_LIMITED`
- Reliability contract verified by integration tests:
  - idempotency replay/conflict (`initiate` and `confirm`)
  - forced outbox-failure rollback (no partial writes)
  - dispatcher publish for branch activation events

## Frontend Notes

- Use `activationType` and `invoice.invoiceType` from activation responses for UX labels:
  - first activation vs additional activation.
- Treat `403 SUBSCRIPTION_UPGRADE_REQUIRED` as recoverable billing action:
  - show pay/resolve subscription CTA.
- Idempotency is supported via `Idempotency-Key` header; replay is signaled by:
  - `Idempotency-Replayed: true`.
