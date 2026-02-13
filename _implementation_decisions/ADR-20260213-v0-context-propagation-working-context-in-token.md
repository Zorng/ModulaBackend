# ADR-20260213 — `/v0` Context Propagation (Working Context In Token)

Status: **Accepted**

Date: **2026-02-13**

## Decision

For the `/v0/*` restart API, we will propagate tenant/branch working context via **access token claims**:

- Access token contains:
  - `authAccountId` (actor identity)
  - optional `tenantId`
  - optional `branchId`
- Tenant selection and branch selection are performed via Auth endpoints that **re-issue tokens** with the selected context.
- Feature endpoints must **not** accept `tenantId` / `branchId` overrides via query/body/headers.

This is an implementation decision (not a KB mutation). It aligns with KB concepts of tenant/branch context selection, while choosing a concrete mechanism.

## Context

We are restarting the backend under `/v0/*` (capstone phase) and adopting KB strictly for:
- self-registration + OTP activation
- explicit tenant membership invite/accept
- branch-scoped authorization requiring explicit branch assignment
- Access Control “fail closed”

The system needs one consistent, front-end-friendly rule for “where do `tenantId` and `branchId` come from?”.

## Alternatives Considered

### A) Working context in token (chosen)
- Pros:
  - simplest contract for feature endpoints (no per-request context params)
  - reduces “branchId injection” risk from query/body
  - makes AccessControl enforcement consistent (context is always present or missing)
- Cons:
  - switching tenant/branch requires token re-issue

### B) Working context in server session
- Pros:
  - switching context can update server-side session without changing token format
- Cons:
  - extra server lookups per request
  - harder to reason about “request specifies branch_id” semantics (depends on session load)

### C) Explicit context headers per request
- Pros:
  - easy to implement
- Cons:
  - high frontend burden; easy to drift into cross-branch mistakes

## Consequences

- API contracts in `api_contract/` should be written assuming:
  - tenant/branch context comes from token (not request params)
  - endpoints that require branch scope must deny with a reason code when `branchId` is missing
- Auth endpoints must define “context resolution” responses for these states:
  - 0/1/many tenant memberships
  - 0/1/many eligible branches
- Access Control must still re-check membership/assignment on sensitive actions:
  - a token carrying `tenantId`/`branchId` must not bypass revocation

## Follow-ups

- Update `/v0` Auth API contract to include:
  - tenant selection endpoint(s)
  - branch selection endpoint(s)
  - token re-issue semantics (access/refresh behavior)
- Standardize error envelope + reason codes for:
  - `TENANT_CONTEXT_REQUIRED`
  - `BRANCH_CONTEXT_REQUIRED`
  - `NO_ACTIVE_MEMBERSHIPS`
  - `NO_BRANCH_ASSIGNED`

