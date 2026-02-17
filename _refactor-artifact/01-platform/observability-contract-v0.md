# Observability Contract (v0 Baseline)

Status: Locked for O0  
Owner: backend  
Effective date: 2026-02-17

## Purpose

Define a stable telemetry field contract so instrumentation can be added incrementally without changing log/metric meaning later.

## Correlation Keys (Canonical)

These keys are the shared correlation surface between runtime telemetry, audit, and outbox.

- `requestId` (required for HTTP flows)
- `actionKey` (required for command paths)
- `tenantId` (required for tenant-scoped paths)
- `branchId` (required when branch-scoped)
- `idempotencyKey` (required when command is idempotent)
- `outboxId` (required for dispatcher processing logs)
- `actorType` (optional; present when identity is resolved)
- `actorAccountId` (optional; present for authenticated account actor)

HTTP propagation rule:
- inbound: accept optional `X-Request-Id`
- outbound: always return `X-Request-Id` response header

## Structured Log Envelope

Every runtime log event must follow:

```ts
type RuntimeLogEvent = {
  level: "DEBUG" | "INFO" | "WARN" | "ERROR";
  timestamp: string; // ISO-8601 UTC
  event: string; // stable event name, e.g. "http.request.completed"
  message: string; // human-readable summary
  requestId?: string;
  actorType?: "ACCOUNT" | "SYSTEM";
  actorAccountId?: string;
  actionKey?: string;
  tenantId?: string;
  branchId?: string;
  idempotencyKey?: string;
  outboxId?: string;
  durationMs?: number;
  errorCode?: string;
  statusCode?: number;
  metadata?: Record<string, unknown>;
};
```

Structured logger capability (required):
- `withContext(context)` must return a child logger that automatically attaches provided fields.

## Event Naming Rules

- lowercase dot notation
- use noun/verb style per surface
- no endpoint path in event name (put in metadata)

Baseline event names:
- `http.request.started`
- `http.request.completed`
- `http.request.failed`
- `db.transaction.started`
- `db.transaction.committed`
- `db.transaction.rolled_back`
- `outbox.dispatch.batch_loaded`
- `outbox.dispatch.published`
- `outbox.dispatch.failed`

## Metrics Contract (Baseline)

- Counters:
  - `http_requests_total{method,route,status}`
  - `http_request_errors_total{method,route,error_code}`
  - `db_transactions_total{result}`
  - `outbox_events_processed_total{event_type,result}`
- Histograms:
  - `http_request_duration_ms{method,route}`
  - `db_transaction_duration_ms{action_key}`
  - `outbox_dispatch_duration_ms{event_type}`
- Gauges:
  - `outbox_backlog_count`

## Redaction Rules (Hard)

Never log raw values for:
- passwords
- access/refresh tokens
- OTP codes
- auth headers/cookies
- full payment payloads

Allowed strategy:
- log booleans or masked values only (e.g. `hasPassword: true`, `phoneMasked: "***001"`).
- log stable IDs and reason codes, not sensitive business payloads.

## Transport/Storage Neutrality

This contract is vendor-neutral.
Implementations can map to console, OTEL, Prometheus, Loki, Datadog, etc., without changing field meaning.

## O0 Exit Criteria

- field contract documented and frozen
- correlation keys locked and aligned with audit/outbox conventions
- redaction rules documented and treated as non-negotiable
