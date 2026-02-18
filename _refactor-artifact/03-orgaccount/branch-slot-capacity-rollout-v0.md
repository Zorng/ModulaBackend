# OrgAccount Branch Slot Capacity Rollout (v0)

Status: Planned  
Owner: backend  
Started: 2026-02-17

## Goal

Extend OrgAccount from one-time first-branch bootstrap to true multi-branch tenancy:
- tenant can run multiple branches,
- additional branches are gated by purchased/unlocked branch slots,
- branch activation remains atomic (`business + audit + outbox`).

## Why this exists

Current `/v0/org/branches/activation/*` flow is currently bootstrap-limited (`0 -> 1` branch with default capacity).
It blocks when capacity is full (`BRANCH_SLOT_LIMIT_REACHED`), and additional slot purchase/unlock flow is not implemented yet.

## Current behavior (baseline)

- Implemented:
  - `POST /v0/org/branches/activation/initiate`
  - `POST /v0/org/branches/activation/confirm`
- Guard:
  - if tenant has no available branch slot => `BRANCH_SLOT_LIMIT_REACHED`
- Post-confirm:
  - creates branch
  - seeds branch entitlements
  - auto-assigns requester to the new branch

## Target behavior

- Keep current activation flow for bootstrap.
- Extend activation flow for additional branches (`1..N`) when slots allow.
- Enforce slot/capacity check before branch activation:
  - `activeBranchCount < unlockedBranchSlots`
- Return stable denial code when full:
  - `BRANCH_SLOT_LIMIT_REACHED`

## Candidate API surface (planned)

- `POST /v0/org/branches/activation/initiate`
- `POST /v0/org/branches/activation/confirm`
- `GET /v0/org/branches` (tenant-wide branch management list)

Notes:
- This is planned contract shape, not implemented yet.
- Existing `/v0/org/branches/accessible` remains assignment-scoped.

## Phases

### Phase S1 — Contract + Decision Lock
- lock slot semantics (`unlockedBranchSlots` source-of-truth)
- lock denial code set (`BRANCH_SLOT_LIMIT_REACHED`, payment-related codes)
- patch `api_contract/branch-v0.md` with explicit current vs planned scope

### Phase S2 — Data Model
- add tenant branch-capacity projection/table
- add branch activation draft type for additional branches
- ensure compatibility with existing first-activation invoice/draft tables

### Phase S3 — Command Implementation
- implement additional-branch initiate/confirm commands
- enforce slot guard + payment verifier + auto-assignment
- keep atomic command contract with audit/outbox

### Phase S4 — Access Control + Entitlement Wiring
- add action keys + route registry entries
- add role constraints (OWNER/ADMIN)
- add capacity/fair-use gates where needed

### Phase S5 — Integration + Reliability
- add integration tests for:
  - slot available vs full
  - idempotency replay/conflict
  - rollback on forced outbox failure
  - outbox dispatcher publish verification

### Phase S6 — Close-Out
- update rollout trackers + outbox event catalog
- finalize branch contract and frontend rollout notes

## Tracking

| Phase | Status | Notes |
|---|---|---|
| S1 Contract + Decision Lock | Not started | |
| S2 Data Model | Not started | |
| S3 Command Implementation | Not started | |
| S4 Access Control + Entitlement Wiring | Not started | |
| S5 Integration + Reliability | Not started | |
| S6 Close-Out | Not started | |
