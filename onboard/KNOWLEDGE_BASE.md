# Knowledge Base (KB) Guide

The knowledge base is Modula’s design memory. Stable business behavior must be traceable to KB documents.

Primary entry points:

- `knowledge_base/README.md`
- `knowledge_base/BusinessLogic/README.MD`

## Reading Order (Non-Negotiable)

- Stories → Domain → Contract → Process → ModSpec

## What Each Layer Is For

- Stories (`knowledge_base/BusinessLogic/1_stories/`)
Human reality and requirements. Non-technical narratives.

- Domain (`knowledge_base/BusinessLogic/2_domain/`)
System truth and invariants. Ownership boundaries.

- Contract (`knowledge_base/BusinessLogic/3_contract/`)
Cross-layer agreements and edge cases. UX behavior rules (not layout).

- Process (`knowledge_base/BusinessLogic/4_process/`)
Cross-module orchestration over time. Sequencing, idempotency, retries, compensation.

- ModSpec (`knowledge_base/BusinessLogic/5_modSpec/`)
Implementation contract. UC-* responsibilities and acceptance criteria.

## How To Decide Where To Patch

- If something “must always be true”: patch Domain.
- If something spans modules over time: patch Process.
- If frontend/backend/QA need a shared edge case rule: patch Contract.
- If you are expressing concrete UC-* and acceptance criteria: patch ModSpec.

If the team is not confident it is stable product truth yet, capture it in an ADR:

- `_implementation_decisions/`

