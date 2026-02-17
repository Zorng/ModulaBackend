# v0 Command Outbox Event Catalog

Status: Active  
Source of truth: `v0_command_outbox` + module command handlers

## Envelope

Dispatcher publishes each outbox row to the in-process event bus with:

```ts
type V0CommandOutboxEvent = {
  type: string; // from event_type
  outboxId: string;
  tenantId: string;
  branchId: string | null;
  actionKey: string;
  actorType: "ACCOUNT" | "SYSTEM";
  actorId: string | null;
  entityType: string;
  entityId: string;
  outcome: "SUCCESS" | "REJECTED" | "FAILED";
  reasonCode: string | null;
  dedupeKey: string | null;
  occurredAt: string; // ISO
  payload: Record<string, unknown>;
};
```

## Current Event Types

### Auth / Tenant
- `TENANT_PROVISIONED`
  - actionKey: `tenant.provision`
  - outcome: `SUCCESS`
  - entityType: `tenant`
  - canonical endpoint metadata: `/v0/org/tenants`
  - compatibility alias (temporary): `/v0/auth/tenants`

### Auth / Membership
- `AUTH_MEMBERSHIP_INVITED`
  - actionKey: `auth.membership.invite`
  - outcome: `SUCCESS`
  - entityType: `membership`
- `AUTH_MEMBERSHIP_INVITATION_ACCEPTED`
  - actionKey: `auth.membership.invitation.accept`
  - outcome: `SUCCESS`
  - entityType: `membership`
- `AUTH_MEMBERSHIP_INVITATION_REJECTED`
  - actionKey: `auth.membership.invitation.reject`
  - outcome: `SUCCESS`
  - entityType: `membership`
- `AUTH_MEMBERSHIP_ROLE_CHANGED`
  - actionKey: `auth.membership.role.change`
  - outcome: `SUCCESS`
  - entityType: `membership`
- `AUTH_MEMBERSHIP_REVOKED`
  - actionKey: `auth.membership.revoke`
  - outcome: `SUCCESS`
  - entityType: `membership`
- `AUTH_MEMBERSHIP_BRANCHES_ASSIGNED`
  - actionKey: `auth.membership.branches.assign`
  - outcome: `SUCCESS`
  - entityType: `membership`

### Attendance
- `ATTENDANCE_CHECKED_IN`
  - actionKey: `attendance.checkIn`
  - outcome: `SUCCESS`
  - entityType: `attendance_record`
- `ATTENDANCE_CHECKIN_REJECTED`
  - actionKey: `attendance.checkIn`
  - outcome: `REJECTED`
  - entityType: `attendance_record`
- `ATTENDANCE_CHECKED_OUT`
  - actionKey: `attendance.checkOut`
  - outcome: `SUCCESS`
  - entityType: `attendance_record`
- `ATTENDANCE_CHECKOUT_REJECTED`
  - actionKey: `attendance.checkOut`
  - outcome: `REJECTED`
  - entityType: `attendance_record`

## Notes

- Dispatcher currently uses at-least-once delivery semantics.
- Subscribers must be idempotent.
- Duplicate `dedupeKey` writes are prevented per tenant at outbox insert time.
