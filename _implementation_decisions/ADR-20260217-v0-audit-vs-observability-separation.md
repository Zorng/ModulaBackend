# ADR-20260217 — Separate Business Audit from System Observability (`/v0`)

Status: Accepted
Date: 2026-02-17

## Decision

`/v0` keeps two distinct logging systems:

1. Business Audit Log (tenant governance evidence)
2. System Observability (engineering telemetry)

They are not merged into one storage stream.

## Context

Audit in KB is business-facing: owners/admins review staff and operational actions.
At the same time, backend needs runtime telemetry for reliability and monitoring.
Mixing both causes access, retention, and privacy conflicts.

## Why separation

- Different audiences:
  - business audit -> tenant owner/admin
  - observability -> engineering/ops
- Different schemas and volume:
  - audit -> immutable action evidence
  - observability -> high-volume runtime signals
- Different retention/compliance behavior:
  - audit -> governance history
  - observability -> operational troubleshooting windows

## Rules

- Business action commands may emit both records.
- Link both streams using correlation IDs (`request_id`, `idempotency_key`, `outbox_id`, `action_key`).
- Observability must avoid sensitive/raw business payloads; keep minimal context.
- Business audit remains the source of truth for tenant accountability flows.

## Consequences

- Keep `v0_audit_events` focused on business audit evidence.
- Add/extend observability pipeline independently (logs/metrics/traces).
- Do not reuse audit read endpoints for operational telemetry dashboards.
