# ADR-20260214 — `/v0` Auth Provider Switch To Supabase

Status: **Accepted**

Date: **2026-02-14**

## Decision

For `/v0/auth` identity flows, Supabase Auth is now the primary provider.

- `V0_AUTH_PROVIDER=supabase` uses Supabase for:
  - registration credential creation/update
  - OTP send/verify
  - password login credential validation
- Local domain/session logic remains in backend:
  - tenant membership lifecycle
  - staff/branch assignment provisioning
  - context token issuance (`tenantId`, `branchId`)
  - authorization checks

## Why

- aligns with KB direction to leverage Supabase hosting + authentication
- reduces custom credential/OTP surface area owned by backend
- preserves current multi-tenant domain model already implemented in `/v0`

## Implementation Notes

- `accounts` table remains the business identity projection.
- Added nullable `accounts.supabase_user_id` linkage.
- `accounts.password_hash` is now nullable (needed only for local fallback mode).
- Local provider path is retained for integration tests and offline CI:
  - `V0_AUTH_PROVIDER=local`

## Env Requirements (Supabase mode)

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- optional explicit switch: `V0_AUTH_PROVIDER=supabase`

## Consequences

- API surface is unchanged for frontend.
- OTP debugging (`debugOtp`) is not provided in Supabase mode.
- Existing integration tests explicitly force local provider mode.
