# OrgAccount Branch Billable Workspaces Rollout (v0)

Status: In Progress  
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
| S5 Integration + Reliability | In progress | Integration coverage includes first/additional activation typing, unpaid confirmation, past-due upgrade deny, and fair-use guards; rollback/outbox-failure matrix still incomplete. |
| S6 Close-Out | In progress | Tracker/index/contracts updated; final close-out depends on S2/S4/S5 completion. |
