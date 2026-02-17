# ADR-20260217 — v0 Observability Strategy: Baseline Now, Full Stack Later

Status: Accepted  
Date: 2026-02-17

## Context

`/v0` now has:
- business audit evidence (`v0_audit_events`)
- outbox event persistence/dispatch (`v0_command_outbox`)

But operational observability remains minimal (`console`-style logging, no metrics/traces pipeline).

Shipping speed is a priority, but deferring all observability would increase debugging cost and retrofit risk as POS modules come online.

## Decision

Adopt a two-stage observability rollout:

1. **Now**: implement a lightweight baseline
   - request context propagation (`requestId`, `tenantId`, `branchId`, `actionKey`)
   - structured logging
   - choke-point instrumentation (HTTP, transaction manager, outbox dispatcher)
   - minimal metrics and alert starter
2. **Later**: implement full observability stack
   - broader tracing coverage
   - mature dashboards/SLOs
   - vendor-level integrations as needed

## Alternatives Considered

### Option A — Full observability now

- Pros:
  - stronger immediate production readiness
  - broad visibility from day one
- Cons:
  - slows feature delivery now
  - high risk of premature tooling lock-in
- Decision: Rejected

### Option B — Baseline now, full later

- Pros:
  - preserves shipping speed
  - avoids expensive blind retrofit later
  - creates clean seams for future expansion
- Cons:
  - monitoring coverage is initially shallow
  - requires follow-up discipline
- Decision: Accepted

### Option C — Defer all observability

- Pros:
  - maximum short-term coding throughput
- Cons:
  - slow/uncertain incident triage
  - higher long-term refactor cost
- Decision: Rejected

## Consequences

- Positive:
  - practical balance between speed and reliability
  - faster debugging on early POS rollout incidents
  - lower chance of cross-cutting rewrites later
- Negative:
  - partial visibility until full rollout phase
  - requires ongoing updates to keep field schema consistent

## Rollout Tracker

Execution artifact:
- `_refactor-artifact/01-platform/observability-baseline-rollout-v0.md`
- `_refactor-artifact/01-platform/observability-contract-v0.md`
