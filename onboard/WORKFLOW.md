# Team Workflow (Parallel-Safe)

This workflow is designed so multiple devs can work in parallel without drifting business logic or breaking migrations.

## Sources Of Truth

- Product truth (what must be true): `knowledge_base/BusinessLogic/...`
- Implementation decisions (why/how we implemented something, before it becomes product truth): `_implementation_decisions/`
- Frontend-facing API contract: `api_contract/` (current)
  - legacy/prototype contracts are stored in `api_contract/_archived/`

Conflict resolution order (non-negotiable):

- `Domain > Process > Contract > ModSpec`

Notes:
- Here, `Contract` and `Process` refer to KB layers under `knowledge_base/BusinessLogic/`:
  - `3_contract/` (cross-layer agreements + edge cases)
  - `4_process/` (cross-module orchestration over time)
- If `3_contract/` and `4_process/` disagree, treat **Process as the behavior source of truth** and update Contract to match.

## When You Change Behavior

1. Confirm whether this is:
- A domain invariant change
- A cross-module process/orchestration change
- A cross-layer contract (edge case, UX behavior states)
- A modspec implementation detail change

2. Patch the correct document(s) first when behavior is meant to be stable.
3. If the team is not ready to promote to KB, write an ADR instead and include promotion criteria.
4. Implement code changes.
5. Update tests, migrations, seed, and API contract as needed.

## PR Checklist (Required In Description)

- KB references or ADR reference (paths)
- Key code references (paths)
- Migration impact: yes/no
- API contract impact (`api_contract/`): yes/no
- Tests: added/updated/deferred (and why)

## Migrations (Avoid Collisions)

- Always add a new migration file. Do not edit already-shipped migrations.
- Use clear names: `migrations/0xx_short_description.sql`
- If two branches add migrations concurrently, rebase and renumber only your new migrations.

## Testing

- Prefer adding integration tests for business flows.
- If tests are blocked by environment, note it in the PR and open a follow-up task.
