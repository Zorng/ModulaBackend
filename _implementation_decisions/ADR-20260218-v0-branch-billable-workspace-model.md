# ADR-20260218 — v0 Branch as Billable Workspace (No Slot Reuse)

## Status
Accepted

## Context

OrgAccount branch activation had drifted toward "slot/capacity" wording in rollout artifacts and contract notes.
That wording implies reusable branch tokens (buy slot -> create branch -> delete branch -> slot returns), which is not the intended commercial model.

KB was updated to lock branch monetization semantics:
- branch is a paid workspace unit,
- additional branches require paid activation,
- no unpaid branch is provisioned,
- archive/delete does not mint reusable branch entitlement by default.

## Decision

For `/v0`:

1. Branch is modeled as a **billable workspace**, not a reusable slot.
2. Activation denial semantics must be payment/subscription-oriented.
3. Canonical unpaid activation denial code:
   - `BRANCH_ACTIVATION_PAYMENT_REQUIRED`
4. Avoid slot/capacity denial semantics such as:
   - `BRANCH_SLOT_LIMIT_REACHED`

## Consequences

- API contracts and rollout trackers use branch activation/billing language instead of slot language.
- Integration expectations for unpaid confirmation use `BRANCH_ACTIVATION_PAYMENT_REQUIRED`.
- Future upgrades may introduce additional subscription denial codes (e.g. `SUBSCRIPTION_UPGRADE_REQUIRED`) without reintroducing slot abstraction.
