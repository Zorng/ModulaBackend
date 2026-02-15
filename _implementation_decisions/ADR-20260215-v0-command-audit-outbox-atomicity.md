# ADR — v0 Command/Audit/Outbox Atomicity Contract

## Metadata

- Date: 2026-02-15
- Status: Accepted
- Owners: backend
- Related KB Docs:
  - `knowledge_base/BusinessLogic/2_domain/60_PlatformSystems/audit_domain.md`
  - `knowledge_base/BusinessLogic/2_domain/60_PlatformSystems/job_scheduler_domain.md`
  - `knowledge_base/BusinessLogic/2_domain/10_Identity&Authorization/authentication_domain_consistency_patched.md`
  - `knowledge_base/BusinessLogic/2_domain/10_Identity&Authorization/accessControl_domain_consistency_patched.md`
- Related Code:
  - `src/modules/v0/auth/api/router.ts`
  - `src/modules/v0/attendance/api/router.ts`
  - `src/modules/v0/audit/*`
  - `src/platform/events/outbox.ts`

## Context

Current `/v0` writes already produce command outcomes and audit evidence, but many audit writes are best-effort and non-blocking.
That means command state may commit even if audit persistence fails, which does not fully satisfy KB invariants for audit-grade evidence and deterministic replay-safe orchestration.

We also have dormant event/outbox infrastructure but no locked contract for live module integration.

## Decision

For state-changing commands in `/v0`, the target architecture is:

- **single DB transaction** per command that persists:
  - business state mutation,
  - audit evidence row,
  - outbox event row.
- If any part fails, the transaction is rolled back.
- Event handlers remain at-least-once safe and idempotent.

Event envelope contract (for outbox payload):

- `eventType` (UPPER_SNAKE_CASE, module-owned)
- `tenantId` (required for in-tenant events)
- `branchId` (required when branch-scoped)
- `actorType` (`ACCOUNT` | `SYSTEM`)
- `actorId` (nullable for system/internal events)
- `entityType`
- `entityId`
- `outcome` (`SUCCESS` | `REJECTED` | `FAILED`)
- `reasonCode` (stable code for non-success outcomes)
- `dedupeKey` (stable replay key)
- `occurredAt` (UTC)
- `payload` (non-secret event metadata)

## Alternatives Considered

- Option A: keep best-effort audit writes only.
  - Rejected: easier now, but violates strict evidence atomicity and increases reconciliation ambiguity.
- Option B: immediate full event-driven rewrite for all modules.
  - Rejected for now: too broad for current execution pace.

## Consequences

- Positive:
  - aligns with KB audit/job scheduler invariants.
  - enables reliable downstream orchestration without hidden data loss.
  - reduces drift when billing/scheduler features are introduced.
- Negative:
  - adds transactional plumbing and outbox migration work.
  - command handlers become slightly more complex.
- Risks:
  - partial rollout can create mixed behaviors if not tracked per endpoint.

## Rollout / Migration Notes

- Introduce a v0 outbox table migration and shared transactional publisher.
- Migrate command paths incrementally:
  1. `tenant.provision`
  2. auth membership writes
  3. attendance writes
- Keep existing best-effort writes only as temporary fallback until each path is migrated.
- Dispatcher execution and retry policy must follow Job Scheduler domain constraints.

## KB Promotion Plan

When this is stable, patch:

- Target KB path(s):
  - `knowledge_base/BusinessLogic/2_domain/60_PlatformSystems/audit_domain.md`
  - `knowledge_base/BusinessLogic/2_domain/60_PlatformSystems/job_scheduler_domain.md`
  - relevant process docs under `knowledge_base/BusinessLogic/4_process/*`
- Promotion criteria:
  - command paths above migrated to atomic contract
  - outbox dispatcher active in runtime
  - integration tests covering rollback + replay behavior
