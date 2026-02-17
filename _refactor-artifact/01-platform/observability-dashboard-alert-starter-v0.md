# Observability Dashboard + Alert Starter (v0)

Status: Initial baseline  
Owner: backend  
Last updated: 2026-02-17

## Goal

Provide a practical starter dashboard/alert shape for local + staging using the O4 metrics and health endpoints.

## Data Sources

- `GET /metrics` (Prometheus text format)
- `GET /health` (component status with `db` and `outbox`)

## Starter Dashboard (Panels)

### HTTP
- Request throughput:
  - metric: `sum(rate(http_requests_total[5m])) by (route, method)`
- Error throughput:
  - metric: `sum(rate(http_request_errors_total[5m])) by (route, error_code)`
- p95 latency by route:
  - metric: `histogram_quantile(0.95, sum(rate(http_request_duration_ms_bucket[5m])) by (le, route))`

### DB Transactions
- Transaction result split:
  - metric: `sum(rate(db_transactions_total[5m])) by (result)`
- p95 transaction latency:
  - metric: `histogram_quantile(0.95, sum(rate(db_transaction_duration_ms_bucket[5m])) by (le, action_key))`
- Rollback ratio:
  - metric: `sum(rate(db_transactions_total{result="rolled_back"}[5m])) / sum(rate(db_transactions_total[5m]))`

### Outbox
- Backlog:
  - metric: `outbox_backlog_count`
- Publish/failed throughput:
  - metric: `sum(rate(outbox_events_processed_total[5m])) by (event_type, result)`
- Dispatch p95 by event type:
  - metric: `histogram_quantile(0.95, sum(rate(outbox_dispatch_duration_ms_bucket[5m])) by (le, event_type))`

### Health
- Component health state:
  - source: `/health`
  - fields:
    - `components.db.status`
    - `components.outbox.status`
    - `components.outbox.lastError` (if degraded)

## Alert Starter

Threshold references are locked in:
- `_refactor-artifact/01-platform/observability-thresholds-v0.md`

### Local
- notify: console + local desktop notification
- purpose: developer feedback while coding and manual testing

### Staging
- notify: `#backend-staging-alerts` (or equivalent team channel)
- escalation:
  1. warning: assigned backend developer acknowledges within business hours
  2. critical: escalate to backend lead immediately

## Alert Routing Policy (v0)

- Ownership:
  - HTTP and transaction alerts -> backend module owner on active workstream
  - outbox alerts -> platform owner
- Correlation-first triage:
  - use `requestId`, `actionKey`, `tenantId`, `branchId`, `outboxId` from logs before manual DB inspection
- Noise control:
  - if alert flaps > 3 times in 30 minutes, raise threshold tuning ticket

## Exit Criteria for O5

- Dashboard panel spec exists and maps to existing metrics.
- Alert thresholds are mapped to an explicit routing policy.
- Team can perform first-level triage using only `/metrics`, `/health`, and structured logs.
