# Work Review Module Boundary (v0)

Status: Phase 1 locked  
Owner context: `HR`  
Canonical route prefix: `/v0/hr`

## 1) Module Identity

- Module name: `workReview`
- Primary KB references:
  - domain: `knowledge_base/BusinessLogic/2_domain/30_HR/work_review_domain.md`
  - process:
    - `knowledge_base/BusinessLogic/4_process/10_WorkForce/30_shift_vs_attendance_evaluation.md`
    - `knowledge_base/BusinessLogic/4_process/10_WorkForce/40_attendance_report.md`
  - reporting edge cases:
    - `knowledge_base/BusinessLogic/3_contract/10_edgecases/reporting_edge_case_sweep.md`

## 2) Owned Facts (Source of Truth)

- Owned facts are derived interpretations, never raw attendance/shift history:
  - `work_review_comparison` (per staff/branch/work-date interpreted record)
  - `work_review_summary` (windowed aggregates for manager/owner review)
- Invariants:
  - derivations are reproducible from source facts + stable ruleset version
  - module never mutates source Shift or Attendance rows
  - each derived record is tenant-scoped and branch-scoped
  - classifications are explainable and evidence-backed
- Classification baseline (locked):
  - `ON_TIME`
  - `LATE`
  - `EARLY_LEAVE`
  - `ABSENT`
  - `OVERTIME`
  - `UNSCHEDULED_WORK`
  - `INCOMPLETE_RECORD`

## 3) Consumed Facts (Read Dependencies)

- `shift`:
  - planned expectations (`shift_pattern`, `shift_instance`)
  - consumed to determine expected start/end and planning coverage
- `attendance`:
  - actual work sessions (`checkInAt`, `checkOutAt`, location evidence flags)
  - consumed to determine factual work timeline
- `staffManagement`:
  - membership identity + branch assignment context for scoped reads
- `orgAccount.branch`:
  - branch scope validation and read visibility context
- `accessControl`:
  - tenant/branch read permission enforcement

## 4) Commands (Write Surface)

- No public user-write command in v0 Phase 1.
- Evaluation writes are system-driven/materialization-driven only (background or internal trigger).
- Internal/system action key lock:
  - `hr.workReview.evaluate.run`

## 5) Queries (Read Surface)

Planned canonical read actions:

- `GET /v0/hr/work-reviews/me`
  - action key: `hr.workReview.read.mine`
- `GET /v0/hr/work-reviews/branch`
  - action key: `hr.workReview.read.branch`
- `GET /v0/hr/work-reviews/tenant`
  - action key: `hr.workReview.read.tenant`
- `GET /v0/hr/work-reviews/summary/branch`
  - action key: `hr.workReview.summary.branch`
- `GET /v0/hr/work-reviews/summary/tenant`
  - action key: `hr.workReview.summary.tenant`

## 6) Event Contract

### Produced events (when materialized evaluation is implemented)

- `HR_WORK_REVIEW_EVALUATED`
  - emitted when comparison rows are derived/upserted for a scoped window
- `HR_WORK_REVIEW_SUMMARY_REFRESHED`
  - emitted when summary aggregates are refreshed

### Subscribed events (locked target)

- `HR_WORK_REVIEW_EVALUATION_REQUESTED`
  - shift module trigger event (already emitted in baseline)
- `ATTENDANCE_CHECKED_IN`
- `ATTENDANCE_CHECKED_OUT`

Notes:
- evaluation remains asynchronous and non-blocking to operational attendance/sale flows
- event subscription rollout is deferred to WorkReview implementation phases

## 7) Access-control Mapping (Phase 1 lock)

Planned action namespace:
- `hr.workReview.read.*`
- `hr.workReview.summary.*`
- `hr.workReview.evaluate.*` (internal/system path)

Planned role model:
- own history: any active membership role
- branch/tenant review:
  - `OWNER | ADMIN | MANAGER`
- system evaluation command:
  - `SYSTEM` actor only

## 8) Deterministic Reporting Rules (Phase 1 lock)

- If shift planning data is missing for a window:
  - never synthesize `ABSENT` from missing plan
  - expose attendance-led outcomes (`UNSCHEDULED_WORK` where applicable)
  - mark planning coverage as missing/degraded
- `VOID_PENDING` semantics and POS provisional states are consumed as reporting context only; work review remains HR-derived and explainable.
- Daily/window boundaries follow `Asia/Phnom_Penh` until branch timezone support is introduced.

## 9) API Contract Docs

- Canonical contract file: `api_contract/work-review-v0.md`
- Compatibility alias policy: none (new surface)

## 10) Test Plan (Required for implementation phases)

### Unit tests

- deterministic classification matrix from shift+attendance fixtures
- tolerance/grace parameter behavior
- missing-plan/missing-checkout degradation rules

### Integration tests

- role-scoped read access (`mine`, `branch`, `tenant`)
- shift + attendance updates eventually converge to stable work-review rows
- reproducibility checks across re-evaluation passes

## 11) Boundary Guard Checklist

- [x] Work Review owns derived insight facts only
- [x] Source facts ownership remains in Shift/Attendance
- [x] Classification baseline and explainability contract are locked
- [x] Canonical route and action-key namespaces are locked
- [x] Event producer/subscriber names are locked for later implementation
