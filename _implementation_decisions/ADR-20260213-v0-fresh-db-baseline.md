# ADR-20260213 — `/v0` Fresh DB Baseline (Legacy Schema Obsolete)

Status: **Accepted**

Date: **2026-02-13**

## Decision

For the `/v0` restart, we treat the prototype database schema as obsolete and start fresh at the DB layer.

- Active migrations are now a clean v0 baseline chain under `migrations/`.
- Legacy migrations are archived under `migrations/_archived/` and are no longer part of runtime migration execution.
- We do not preserve backward compatibility with prototype-era tables in `/v0` migration design.

## Context

The project moved to a restart strategy (capstone phase) with strict KB alignment. Continuing to evolve the prototype schema would keep legacy coupling and undermine predictable progress.

To reduce drift:
- migration chain must be self-contained for clean bootstrap
- auth phase should not depend on legacy tables that are not in the v0 baseline

## Consequences

- Positive:
  - deterministic clean database bootstrap
  - lower schema complexity while implementing `/v0`
  - clear separation between historical prototype and active restart

- Tradeoff:
  - existing local prototype DBs are not migration targets for `/v0`; reset is expected

## Rollout Notes

- Current active baseline:
  - `migrations/000_platform_bootstrap.sql`
  - `migrations/001_create_tenants_and_branches.sql`
  - `migrations/002_create_accounts.sql`
  - `migrations/003_create_auth_phone_otps.sql`
  - `migrations/004_create_v0_auth_sessions.sql`
- Seed updated to match v0 baseline: `migrations/_seed_dev.sql`.
