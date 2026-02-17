# Observability Thresholds (v0 Baseline)

Status: Initial baseline  
Owner: backend  
Last updated: 2026-02-17

## Purpose

Define initial local/staging thresholds for O4 so incidents are detectable before full alerting/SLO rollout.

## Threshold Set (Local/Staging)

### HTTP
- `http_request_errors_total` growth:
  - warn: > 5 errors / 5 min on same route
  - critical: > 20 errors / 5 min on same route
- `http_request_duration_ms` p95 (per route):
  - warn: > 500ms for 10 min
  - critical: > 1000ms for 10 min

### DB Transactions
- `db_transactions_total{result="rolled_back"}` ratio:
  - warn: rollback ratio > 2% over 15 min
  - critical: rollback ratio > 5% over 15 min
- `db_transaction_duration_ms` p95:
  - warn: > 300ms over 10 min
  - critical: > 800ms over 10 min

### Outbox
- `outbox_backlog_count`:
  - warn: > 100 for 5 min
  - critical: > 500 for 5 min
- `outbox_events_processed_total{result="failed"}` growth:
  - warn: > 10 failures / 5 min
  - critical: > 50 failures / 5 min
- `/health` component `outbox.status`:
  - warn: `degraded` for > 2 poll windows
  - critical: `degraded` for > 10 min

## Notes

- These values are intentionally conservative for pre-production environments.
- Recalibrate thresholds after first stable POS production traffic profile.
