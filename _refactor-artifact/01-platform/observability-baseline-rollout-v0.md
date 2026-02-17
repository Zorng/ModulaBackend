# Observability Baseline Rollout (v0)

Status: In progress (O3 completed)  
Owner: backend  
Started: 2026-02-17

## Goal

Ship a low-friction observability baseline now (logs + context propagation + core metrics), while deferring full telemetry platform rollout until POS traffic and module surface stabilize.

## Why this exists

We currently have:
- business audit evidence (`v0_audit_events`)
- outbox events (`v0_command_outbox`)

But we do not yet have:
- structured runtime telemetry pipeline
- metrics + alerting baseline
- distributed tracing

This makes incident triage slower than needed once write volume increases.

## Decision Summary (Locked)

Chosen strategy: **baseline now, full stack later**.

### Options evaluated

| Option | Pros | Cons | Decision |
|---|---|---|---|
| Full observability now | strong production readiness; fewer blind spots | slower feature delivery; premature tooling choices | Rejected |
| Baseline now, full later | keeps shipping speed; avoids hard retrofit; incremental learning path | dashboards/alerts remain basic at first | **Chosen** |
| Defer all observability | fastest immediate coding | highest debugging pain; higher future retrofit cost | Rejected |

### Tradeoff call

- Prioritize feature throughput, but do not stay blind.
- Invest in seams now so later OpenTelemetry/monitoring integration is adapter work, not architecture rewrite.

## Scope (Baseline)

1. Request context propagation (`requestId`, `tenantId`, `branchId`, `actionKey`)
2. Structured logger contract (no raw ad-hoc `console.*` in app paths)
3. Instrumentation hooks at platform choke points:
   - HTTP request lifecycle
   - DB transaction boundary
   - outbox dispatcher
4. Minimal metrics:
   - request count, latency, error count
   - transaction rollback count
   - outbox processed/failure/backlog counts
5. Minimal operational runbook and alert thresholds

Out of scope for baseline:
- full distributed tracing everywhere
- vendor-specific dashboards lock-in
- complete SLO program

## Execution Phases

### Phase O0 — Contract Lock
- lock log field schema for runtime telemetry
- lock correlation keys shared with audit/outbox (`requestId`, `idempotencyKey`, `outboxId`, `actionKey`)
- define redaction rules (no password/token/secret payloads)

### Phase O1 — Request Context Middleware
- add request context middleware for `/v0`
- inject request ID and attach scoped context to request lifecycle
- ensure context is reachable by command handlers and platform hooks

### Phase O2 — Structured Logger Foundation
- evolve `src/platform/logger/index.ts` to structured logging API
- support contextual child logger pattern (`withContext`)
- replace direct logs in active `/v0` paths with structured logging calls

### Phase O3 — Instrumentation Hooks
- HTTP: start/end/error logs + duration
- transaction manager: begin/commit/rollback duration + reason
- outbox dispatcher: fetch/process/retry/failure/backlog signals

### Phase O4 — Metrics + Health Baseline
- expose basic metrics endpoint
- add lightweight health checks for DB/outbox liveness
- define first threshold set for local/staging monitoring

### Phase O5 — Dashboard + Alert Starter
- add minimal dashboard spec for:
  - request error rate
  - p95 latency
  - outbox lag/failures
- define first alert routing policy (who gets what)

### Phase O6 — Tracing Pilot (Deferred)
- pilot trace spans on one critical write flow (candidate: `sale-order.finalize`)
- decide expansion after baseline metrics prove useful

## Tracking

| Phase | Status | Notes |
|---|---|---|
| O0 Contract Lock | Completed | Telemetry schema, correlation keys, baseline event names, metrics contract, and hard redaction rules locked in `_refactor-artifact/01-platform/observability-contract-v0.md`. |
| O1 Request Context Middleware | Completed | Added request context middleware (`src/platform/http/middleware/request-context.ts`) with request ID propagation via `X-Request-Id`, optional actor/tenant/branch enrichment from JWT claims, response header echo, and Express request typing in `src/types/express.d.ts`; access-control hook now sets `actionKey` on matched protected routes. |
| O2 Structured Logger Foundation | Completed | Replaced console logger with structured `pino` logger and child-context support in `src/platform/logger/index.ts`; updated active request paths to use structured events (`server.started`, `http.request.failed`, validation/image-proxy failures). |
| O3 Instrumentation Hooks | Completed | Added HTTP lifecycle telemetry middleware (`http.request.started/completed` with duration), transaction manager instrumentation (`db.transaction.*`), and outbox dispatcher instrumentation (`outbox.dispatch.*` incl. batch load/publish/failure/backlog/tick summaries). |
| O4 Metrics + Health Baseline | Not started | |
| O5 Dashboard + Alert Starter | Not started | |
| O6 Tracing Pilot (Deferred) | Deferred | Defer until critical POS write paths stabilize. |

## Success Criteria

- Given a failed `/v0` write, we can trace request -> transaction -> outbox path using correlation IDs.
- We can answer in under 10 minutes:
  - what failed?
  - where it failed (HTTP/DB/outbox)?
  - how often it is failing?
- Baseline is implemented without blocking current POS module rollout sequence.
