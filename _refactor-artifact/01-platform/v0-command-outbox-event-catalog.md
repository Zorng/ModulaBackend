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
- `ORG_TENANT_PROVISIONED`
  - actionKey: `org.tenant.provision`
  - outcome: `SUCCESS`
  - entityType: `tenant`
  - canonical endpoint metadata: `/v0/org/tenants`
  - compatibility alias (temporary): `/v0/auth/tenants`

### HR / StaffManagement
- `HR_STAFF_BRANCHES_ASSIGNED`
  - actionKey: `hr.staff.branch.assign`
  - outcome: `SUCCESS`
  - entityType: `membership`
  - canonical endpoint metadata: `/v0/hr/staff/memberships/:membershipId/branches`
  - compatibility alias (temporary): `/v0/auth/memberships/:membershipId/branches`

### OrgAccount / Branch
- `ORG_BRANCH_ACTIVATION_INITIATED`
  - actionKey: `org.branch.activation.initiate`
  - outcome: `SUCCESS`
  - entityType: `branch_activation_draft`
  - canonical endpoint metadata: `/v0/org/branches/activation/initiate`
- `ORG_BRANCH_ACTIVATED`
  - actionKey: `org.branch.activation.confirm`
  - outcome: `SUCCESS`
  - entityType: `branch`
  - canonical endpoint metadata: `/v0/org/branches/activation/confirm`
  - payload includes `draftId`, `invoiceId`, `paymentConfirmationRef`
  - dispatcher publish verification is covered in `src/integration-tests/v0-first-branch-activation.int.test.ts`

### OrgAccount / Membership (canonical)
- `ORG_MEMBERSHIP_INVITED`
  - actionKey: `org.membership.invite`
  - outcome: `SUCCESS`
  - entityType: `membership`
- `ORG_MEMBERSHIP_INVITATION_ACCEPTED`
  - actionKey: `org.membership.invitation.accept`
  - outcome: `SUCCESS`
  - entityType: `membership`
- `ORG_MEMBERSHIP_INVITATION_REJECTED`
  - actionKey: `org.membership.invitation.reject`
  - outcome: `SUCCESS`
  - entityType: `membership`
- `ORG_MEMBERSHIP_ROLE_CHANGED`
  - actionKey: `org.membership.role.change`
  - outcome: `SUCCESS`
  - entityType: `membership`
- `ORG_MEMBERSHIP_REVOKED`
  - actionKey: `org.membership.revoke`
  - outcome: `SUCCESS`
  - entityType: `membership`

Compatibility note:
- Legacy auth alias routes (`/v0/auth/memberships/*`) emit canonical ownership action keys/events:
  - OrgAccount lifecycle commands => `org.membership.*`
  - HR staff assignment command => `hr.staff.branch.assign` / `HR_STAFF_BRANCHES_ASSIGNED`
- Dispatcher compatibility publish (temporary during B5):
  - `ORG_TENANT_PROVISIONED` additionally publishes `TENANT_PROVISIONED` on in-process bus.

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

### Policy
- `POLICY_UPDATED`
  - actionKey: `policy.currentBranch.update`
  - outcome: `SUCCESS`
  - entityType: `branch_policy`
  - canonical endpoint metadata: `/v0/policy/current-branch`

### Menu
- `MENU_ITEM_CREATED`
  - actionKey: `menu.items.create`
  - outcome: `SUCCESS`
  - entityType: `menu_item`
  - canonical endpoint metadata: `/v0/menu/items`
- `MENU_ITEM_UPDATED`
  - actionKey: `menu.items.update`
  - outcome: `SUCCESS`
  - entityType: `menu_item`
  - canonical endpoint metadata: `/v0/menu/items/:menuItemId`
- `MENU_ITEM_ARCHIVED`
  - actionKey: `menu.items.archive`
  - outcome: `SUCCESS`
  - entityType: `menu_item`
  - canonical endpoint metadata: `/v0/menu/items/:menuItemId/archive`
- `MENU_ITEM_RESTORED`
  - actionKey: `menu.items.restore`
  - outcome: `SUCCESS`
  - entityType: `menu_item`
  - canonical endpoint metadata: `/v0/menu/items/:menuItemId/restore`
- `MENU_ITEM_BRANCH_VISIBILITY_SET`
  - actionKey: `menu.items.visibility.set`
  - outcome: `SUCCESS`
  - entityType: `menu_item`
  - canonical endpoint metadata: `/v0/menu/items/:menuItemId/visibility`
- `MENU_CATEGORY_CREATED`
  - actionKey: `menu.categories.create`
  - outcome: `SUCCESS`
  - entityType: `menu_category`
  - canonical endpoint metadata: `/v0/menu/categories`
- `MENU_CATEGORY_UPDATED`
  - actionKey: `menu.categories.update`
  - outcome: `SUCCESS`
  - entityType: `menu_category`
  - canonical endpoint metadata: `/v0/menu/categories/:categoryId`
- `MENU_CATEGORY_ARCHIVED`
  - actionKey: `menu.categories.archive`
  - outcome: `SUCCESS`
  - entityType: `menu_category`
  - canonical endpoint metadata: `/v0/menu/categories/:categoryId/archive`
- `MODIFIER_GROUP_CREATED`
  - actionKey: `menu.modifierGroups.create`
  - outcome: `SUCCESS`
  - entityType: `modifier_group`
  - canonical endpoint metadata: `/v0/menu/modifier-groups`
- `MODIFIER_GROUP_UPDATED`
  - actionKey: `menu.modifierGroups.update`
  - outcome: `SUCCESS`
  - entityType: `modifier_group`
  - canonical endpoint metadata: `/v0/menu/modifier-groups/:groupId`
- `MODIFIER_GROUP_ARCHIVED`
  - actionKey: `menu.modifierGroups.archive`
  - outcome: `SUCCESS`
  - entityType: `modifier_group`
  - canonical endpoint metadata: `/v0/menu/modifier-groups/:groupId/archive`
- `MODIFIER_OPTION_CREATED`
  - actionKey: `menu.modifierOptions.create`
  - outcome: `SUCCESS`
  - entityType: `modifier_option`
  - canonical endpoint metadata: `/v0/menu/modifier-groups/:groupId/options`
- `MODIFIER_OPTION_UPDATED`
  - actionKey: `menu.modifierOptions.update`
  - outcome: `SUCCESS`
  - entityType: `modifier_option`
  - canonical endpoint metadata: `/v0/menu/modifier-groups/:groupId/options/:optionId`
- `MODIFIER_OPTION_ARCHIVED`
  - actionKey: `menu.modifierOptions.archive`
  - outcome: `SUCCESS`
  - entityType: `modifier_option`
  - canonical endpoint metadata: `/v0/menu/modifier-groups/:groupId/options/:optionId/archive`
- `MENU_ITEM_COMPOSITION_UPSERTED`
  - actionKey: `menu.composition.upsert`
  - outcome: `SUCCESS`
  - entityType: `menu_item`
  - canonical endpoint metadata: `/v0/menu/items/:menuItemId/composition`

## Notes

- Dispatcher currently uses at-least-once delivery semantics.
- Subscribers must be idempotent.
- Duplicate `dedupeKey` writes are prevented per tenant at outbox insert time.
