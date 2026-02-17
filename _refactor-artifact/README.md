# Refactor Artifacts

This folder tracks implementation/refactor plans and execution notes for `/v0`.

## Structure

- `00-index.md`
  - registry of active artifacts and current status
- `01-platform/`
  - platform foundation artifacts (access control, entitlements, outbox, rollout)
- `02-boundary/`
  - module boundary alignment artifacts and templates
- `03-orgaccount/`
  - OrgAccount overhaul artifacts
- `04-auth/`
  - Auth overhaul artifacts
- `05-pos/`
  - POS module sequencing and per-module rollout trackers
  - files are prefixed with build-order numbers (`00_`, `01_`, ... `10_`)
- `90-archive/`
  - superseded/closed artifacts kept for history

## Rules

- New artifact files must use `kebab-case.md`.
- New artifacts should be registered in `00-index.md`.
- If an artifact is superseded, move it to `90-archive/` and note replacement in `00-index.md`.
