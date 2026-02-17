# Dev Setup Wizard (CLI) — Tracking Doc

Status: **Discussion / Planning**

Goal: make the backend **easy for frontend developers to consume** during capstone by providing a deterministic, one-command local bootstrap that produces usable demo accounts and data.

This doc is intentionally separate from `_refactor-artifact/04-auth/saas-multi-tenant-overhaul.md` so we can discuss/setup the wizard without mixing it into the platform rebuild plan.

Location: `_handbook/dev-setup-wizard.md`

---

## Context

- Restarted API lives under **`/v0/*`** (unstable contract, capstone phase).
- Identity + membership follows updated KB model:
  - self-registration is possible
  - staff onboarding uses explicit invite + accept
  - credentials are user-owned (no admin-set passwords)
- Wizard is a **dev convenience** to accelerate UI work; it must not redefine the product model.

---

## Locked Decisions (Confirmed)

- Wizard runs as a **CLI script** (not an HTTP endpoint).
- Wizard mode: **fast demo** (frontend can login immediately without stepping through onboarding).
- OTP strategy in dev/test: **fixed OTP**.

---

## Principles / Requirements

- **Idempotent**:
  - safe to run multiple times; should not create duplicates
  - should be able to re-run after a DB reset without manual cleanup
- **Deterministic outputs**:
  - prints the demo accounts (phone + password) and the tenant/branch structure
  - optional: use fixed UUIDs for stable references (helpful for frontend fixtures)
- **Environment gated**:
  - must refuse to run unless `NODE_ENV=development` (or explicit `--i-know-what-im-doing`)
- **No network dependencies**:
  - must not require external SMS providers
- **KB-aligned semantics**:
  - even if we seed "already verified" accounts, data must still fit KB invariants (memberships, assignments, etc.)

---

## What The Wizard Should Produce (Fast Demo Baseline)

Minimum viable seed (for frontend productivity):
- `AuthAccount` records with:
  - phone number
  - password hash set
  - phone verified flag set (so login works)
  - basic profile fields populated (first name, last name, etc.)
- `Tenant` + `Branch` data
- `TenantMembership`:
  - ACTIVE memberships with `role_key` assigned
  - governance invariants respected (at least one ACTIVE OWNER per tenant)
- `StaffProfile` (operational view) for accounts that will operate day-to-day
- `BranchAssignment` for branch-scoped work (explicit assignment is mandatory)

Optional seeds (later):
- a few cash sessions, attendance records, sample sales (only after core modules exist)

---

## Fixed OTP (Dev/Test) — Design Notes

We still want OTP logic in the platform, but for local dev:
- Define a fixed OTP code, for example `000000`.
- OTP verification succeeds only when:
  - `NODE_ENV=development|test`
  - the provided code equals the configured fixed OTP.

Open question:
- should fixed OTP be enabled by default in dev, or only when `DEV_FIXED_OTP` env var is set?

---

## Implementation Options (Wizard Mechanics)

Option A: DB-first seeding (direct inserts)
- Pros: fastest, fewer endpoints needed early
- Cons: tightly coupled to schema; must be updated alongside migrations

Option B: API-first seeding (call `/v0/*` endpoints)
- Pros: dogfoods API, reduces schema coupling
- Cons: requires endpoints to exist first; slower for large seeds

Recommended direction:
- Start with **DB-first** for Phase 0/1 (to unblock frontend ASAP), then migrate to API-first once the system stabilizes.

---

## Output Contract (What The Script Prints)

The wizard should print a concise summary:
- tenants and branches created
- demo accounts grouped by tenant/branch with roles
- the fixed OTP policy (if relevant)
- how to login (base URL + endpoints)

This output should be copy-pastable into a frontend dev doc (or the wizard can optionally write a markdown file under `onboard/`).

---

## Open Questions

- Should the wizard also create:
  - membership invites (INVITED) for testing invitation inbox UI?
  - or only ACTIVE memberships (fast demo only)?
- Reset semantics:
  - `--reset` should drop and recreate the DB, or only truncate seed tables?
- Should we generate a "demo accounts" markdown file automatically (for the frontend repo)?
- Should seeded users include multi-tenant and multi-branch cases by default?

---

## Progress Log

| Date (YYYY-MM-DD) | Note |
|---|---|
| 2026-02-13 | Tracking doc created. Locked decisions: CLI wizard, fast demo, fixed OTP. |
