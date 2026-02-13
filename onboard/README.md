# Onboarding (Backend Repo)

This folder explains how to work in this repo without creating design drift or doc noise.

## Doc Map (Why `onboard/` and `_handbook/` Both Exist)

- `onboard/` is the **Start Here** learning path (short, curated, ordered).
  - Goal: get a new contributor productive quickly.
  - Rule: prefer **linking to** deeper docs rather than duplicating them.
- `_handbook/` is the **reference manual** (canonical details; can be long).
  - Goal: define “how we do things here” (workflow, conventions, tooling).
  - Rule: if `onboard/` and `_handbook/` disagree, **treat `_handbook/` as the latest operational truth** and fix `onboard/` to point to it.

## Start Here

- Parallel dev workflow (PR rules, migrations, tests): `onboard/WORKFLOW.md`
- How business behavior is documented (and where to patch): `onboard/KNOWLEDGE_BASE.md`
- How to write implementation decisions without mutating product truth: `onboard/DECISIONS.md`
- Codebase tour (where things live): `onboard/CODEBASE_TOUR.md`

## Frequently Used References

- Backend workflow (KB -> tests -> implementation): `_handbook/backend-workflow.md`
- Dev setup wizard (CLI, fast demo, fixed OTP): `_handbook/dev-setup-wizard.md`

## Sources Of Truth

- Business behavior and product truth: `knowledge_base/`
- Implementation “why/how” and tradeoffs (ADR style): `_implementation_decisions/`
- HTTP contract for frontend: `api_contract/` (current) and `api_contract/_archived/` (legacy/prototype)
- Operational repo guidelines (workflow, conventions, tooling): `_handbook/`
