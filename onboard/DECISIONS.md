# Implementation Decisions (ADRs)

Use `_implementation_decisions/` for decisions that explain tradeoffs, constraints, and rollout notes without prematurely mutating the KB.

## When To Write An ADR

- A decision affects multiple modules/domains.
- A decision changes data model shape or workflow semantics.
- A decision is time-boxed (March vs later) and may evolve.
- A decision is an implementation constraint that is not product truth.

## ADR Naming

- `ADR-YYYYMMDD-short-title.md`

## ADR Required Sections

- Context
- Decision
- Alternatives considered
- Consequences
- Rollout / migration notes
- KB promotion plan (what doc will be patched later, and when)

Template:

- `_implementation_decisions/ADR_TEMPLATE.md`

