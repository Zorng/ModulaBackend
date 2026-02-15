# API Contracts (Frontend Integration)

This folder contains the **frontend-facing HTTP API contracts** for this backend repo.

## Folder Structure

- `api_contract/_archived/`
  - Legacy/prototype contracts (pre-restart).
  - These are kept for reference only and are expected to be broken as we restart the API under `/v0`.
- `api_contract/` (this folder)
  - The **current** API contracts for the restart.
  - New contracts should be written here (not under `_archived/`).

## Notes

- The authoritative business behavior lives in `knowledge_base/`.
- API contracts are the backend<->frontend agreement for HTTP payloads, status codes, and reason codes.
- During capstone we version the HTTP surface under `/v0/*`, so the contracts here should describe `/v0` endpoints.
- Context propagation (workflow rule):
  - `/v0` uses a **working context in token** model.
  - Feature endpoints must **not** accept `tenantId` / `branchId` overrides via query/body/headers.
  - Tenant/branch selection (and switching) is done via Auth endpoints that **re-issue access tokens** with updated context.

## Active Contracts

- `api_contract/auth-v0.md`
- `api_contract/attendance-v0.md`
- `api_contract/tenant-v0.md`
- `api_contract/branch-v0.md`
- `api_contract/access-control-v0.md`
- `api_contract/subscription-v0.md`
- `api_contract/idempotency-v0.md`
- `api_contract/audit-v0.md`
