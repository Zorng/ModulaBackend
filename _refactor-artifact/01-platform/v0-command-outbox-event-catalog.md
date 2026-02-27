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

### HR / Shift
- `HR_SHIFT_PATTERN_CREATED`
  - actionKey: `hr.shift.pattern.create`
  - outcome: `SUCCESS`
  - entityType: `shift_pattern`
  - canonical endpoint metadata: `/v0/hr/shifts/patterns`
- `HR_SHIFT_PATTERN_UPDATED`
  - actionKey: `hr.shift.pattern.update`
  - outcome: `SUCCESS`
  - entityType: `shift_pattern`
  - canonical endpoint metadata: `/v0/hr/shifts/patterns/:patternId`
- `HR_SHIFT_PATTERN_DEACTIVATED`
  - actionKey: `hr.shift.pattern.deactivate`
  - outcome: `SUCCESS`
  - entityType: `shift_pattern`
  - canonical endpoint metadata: `/v0/hr/shifts/patterns/:patternId/deactivate`
- `HR_SHIFT_INSTANCE_CREATED`
  - actionKey: `hr.shift.instance.create`
  - outcome: `SUCCESS`
  - entityType: `shift_instance`
  - canonical endpoint metadata: `/v0/hr/shifts/instances`
- `HR_SHIFT_INSTANCE_UPDATED`
  - actionKey: `hr.shift.instance.update`
  - outcome: `SUCCESS`
  - entityType: `shift_instance`
  - canonical endpoint metadata: `/v0/hr/shifts/instances/:instanceId`
- `HR_SHIFT_INSTANCE_CANCELLED`
  - actionKey: `hr.shift.instance.cancel`
  - outcome: `SUCCESS`
  - entityType: `shift_instance`
  - canonical endpoint metadata: `/v0/hr/shifts/instances/:instanceId/cancel`
- `HR_SHIFT_COMMAND_REJECTED`
  - actionKey: `hr.shift.*`
  - outcome: `REJECTED`
  - entityType: `shift_pattern` or `shift_instance`
  - reasonCode mirrors shift error code (for example `SHIFT_TIME_RANGE_INVALID`, `SHIFT_OVERLAP_CONFLICT`)
- `HR_WORK_REVIEW_EVALUATION_REQUESTED`
  - actionKey: originating `hr.shift.*` command
  - outcome: `SUCCESS`
  - entityType: `work_review_evaluation_trigger`
  - payload carries shift membership/branch/date context for downstream shift-vs-attendance evaluation orchestration
  - producer + reliability path is covered in `src/integration-tests/v0-shift.int.test.ts`

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
- `ORG_MEMBERSHIP_INVITATION_REVOKED`
  - actionKey: `org.membership.invitation.revoke`
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

### Discount
- `DISCOUNT_RULE_CREATED`
  - actionKey: `discount.rules.create`
  - outcome: `SUCCESS`
  - entityType: `discount_rule`
  - canonical endpoint metadata: `/v0/discount/rules`
- `DISCOUNT_RULE_UPDATED`
  - actionKey: `discount.rules.update`
  - outcome: `SUCCESS`
  - entityType: `discount_rule`
  - canonical endpoint metadata: `/v0/discount/rules/:ruleId`
- `DISCOUNT_RULE_ACTIVATED`
  - actionKey: `discount.rules.activate`
  - outcome: `SUCCESS`
  - entityType: `discount_rule`
  - canonical endpoint metadata: `/v0/discount/rules/:ruleId/activate`
- `DISCOUNT_RULE_DEACTIVATED`
  - actionKey: `discount.rules.deactivate`
  - outcome: `SUCCESS`
  - entityType: `discount_rule`
  - canonical endpoint metadata: `/v0/discount/rules/:ruleId/deactivate`
- `DISCOUNT_RULE_ARCHIVED`
  - actionKey: `discount.rules.archive`
  - outcome: `SUCCESS`
  - entityType: `discount_rule`
  - canonical endpoint metadata: `/v0/discount/rules/:ruleId/archive`

### Inventory
- `INVENTORY_STOCK_CATEGORY_CREATED`
  - actionKey: `inventory.categories.create`
  - outcome: `SUCCESS`
  - entityType: `inventory_stock_category`
  - canonical endpoint metadata: `/v0/inventory/categories`
- `INVENTORY_STOCK_CATEGORY_UPDATED`
  - actionKey: `inventory.categories.update`
  - outcome: `SUCCESS`
  - entityType: `inventory_stock_category`
  - canonical endpoint metadata: `/v0/inventory/categories/:categoryId`
- `INVENTORY_STOCK_CATEGORY_ARCHIVED`
  - actionKey: `inventory.categories.archive`
  - outcome: `SUCCESS`
  - entityType: `inventory_stock_category`
  - canonical endpoint metadata: `/v0/inventory/categories/:categoryId/archive`
- `INVENTORY_STOCK_ITEM_CREATED`
  - actionKey: `inventory.items.create`
  - outcome: `SUCCESS`
  - entityType: `inventory_stock_item`
  - canonical endpoint metadata: `/v0/inventory/items`
- `INVENTORY_STOCK_ITEM_UPDATED`
  - actionKey: `inventory.items.update`
  - outcome: `SUCCESS`
  - entityType: `inventory_stock_item`
  - canonical endpoint metadata: `/v0/inventory/items/:stockItemId`
- `INVENTORY_STOCK_ITEM_ARCHIVED`
  - actionKey: `inventory.items.archive`
  - outcome: `SUCCESS`
  - entityType: `inventory_stock_item`
  - canonical endpoint metadata: `/v0/inventory/items/:stockItemId/archive`
- `INVENTORY_STOCK_ITEM_RESTORED`
  - actionKey: `inventory.items.restore`
  - outcome: `SUCCESS`
  - entityType: `inventory_stock_item`
  - canonical endpoint metadata: `/v0/inventory/items/:stockItemId/restore`
- `INVENTORY_RESTOCK_BATCH_RECORDED`
  - actionKey: `inventory.restockBatches.create`
  - outcome: `SUCCESS`
  - entityType: `inventory_restock_batch`
  - canonical endpoint metadata: `/v0/inventory/restock-batches`
- `INVENTORY_RESTOCK_BATCH_METADATA_UPDATED`
  - actionKey: `inventory.restockBatches.updateMeta`
  - outcome: `SUCCESS`
  - entityType: `inventory_restock_batch`
  - canonical endpoint metadata: `/v0/inventory/restock-batches/:batchId`
- `INVENTORY_RESTOCK_BATCH_ARCHIVED`
  - actionKey: `inventory.restockBatches.archive`
  - outcome: `SUCCESS`
  - entityType: `inventory_restock_batch`
  - canonical endpoint metadata: `/v0/inventory/restock-batches/:batchId/archive`
- `INVENTORY_ADJUSTMENT_RECORDED`
  - actionKey: `inventory.adjustments.apply`
  - outcome: `SUCCESS`
  - entityType: `inventory_journal_entry`
  - canonical endpoint metadata: `/v0/inventory/adjustments`

### Cash Session
- `CASH_SESSION_OPENED`
  - actionKey: `cashSession.open`
  - outcome: `SUCCESS`
  - entityType: `cash_session`
  - canonical endpoint metadata: `/v0/cash/sessions`
- `CASH_SESSION_CLOSED`
  - actionKey: `cashSession.close`
  - outcome: `SUCCESS`
  - entityType: `cash_session`
  - canonical endpoint metadata: `/v0/cash/sessions/:sessionId/close`
- `CASH_SESSION_FORCE_CLOSED`
  - actionKey: `cashSession.forceClose`
  - outcome: `SUCCESS`
  - entityType: `cash_session`
  - canonical endpoint metadata: `/v0/cash/sessions/:sessionId/force-close`
- `CASH_MOVEMENT_RECORDED`
  - actionKey: `cashSession.movement.paidIn`
  - outcome: `SUCCESS`
  - entityType: `cash_movement`
  - canonical endpoint metadata: `/v0/cash/sessions/:sessionId/movements/paid-in`
- `CASH_MOVEMENT_RECORDED`
  - actionKey: `cashSession.movement.paidOut`
  - outcome: `SUCCESS`
  - entityType: `cash_movement`
  - canonical endpoint metadata: `/v0/cash/sessions/:sessionId/movements/paid-out`
- `CASH_ADJUSTMENT_RECORDED`
  - actionKey: `cashSession.movement.adjustment`
  - outcome: `SUCCESS`
  - entityType: `cash_movement`
  - canonical endpoint metadata: `/v0/cash/sessions/:sessionId/movements/adjustment`

Verification note:
- dispatcher publish path for `CASH_SESSION_OPENED` is covered by `src/integration-tests/v0-cash-session.int.test.ts`.
- subscriber integration note:
  - `CASH_SESSION_CLOSED` and `CASH_SESSION_FORCE_CLOSED` are consumed by OperationalNotification subscriber to emit ON-04 in-app awareness signals.
  - covered by `src/integration-tests/v0-operational-notification.int.test.ts`.

### Sale + Order
- `ORDER_TICKET_PLACED`
  - actionKey: `order.place`
  - outcome: `SUCCESS`
  - entityType: `order_ticket`
  - canonical endpoint metadata: `/v0/orders`
- `ORDER_ITEMS_ADDED`
  - actionKey: `order.items.add`
  - outcome: `SUCCESS`
  - entityType: `order_ticket`
  - canonical endpoint metadata: `/v0/orders/:orderId/items`
- `ORDER_CHECKOUT_COMPLETED`
  - actionKey: `order.checkout`
  - outcome: `SUCCESS`
  - entityType: `sale`
  - canonical endpoint metadata: `/v0/orders/:orderId/checkout`
- `ORDER_FULFILLMENT_STATUS_UPDATED`
  - actionKey: `order.fulfillment.status.update`
  - outcome: `SUCCESS`
  - entityType: `order_fulfillment_batch`
  - canonical endpoint metadata: `/v0/orders/:orderId/fulfillment`
- `SALE_FINALIZED`
  - actionKey: `sale.finalize`
  - outcome: `SUCCESS`
  - entityType: `sale`
  - canonical endpoint metadata: `/v0/sales/:saleId/finalize`
- `SALE_VOID_REQUESTED`
  - actionKey: `sale.void.request`
  - outcome: `SUCCESS`
  - entityType: `void_request`
  - canonical endpoint metadata: `/v0/sales/:saleId/void/request`
- `SALE_VOID_APPROVED`
  - actionKey: `sale.void.approve`
  - outcome: `SUCCESS`
  - entityType: `void_request`
  - canonical endpoint metadata: `/v0/sales/:saleId/void/approve`
- `SALE_VOID_REJECTED`
  - actionKey: `sale.void.reject`
  - outcome: `SUCCESS`
  - entityType: `void_request`
  - canonical endpoint metadata: `/v0/sales/:saleId/void/reject`
- `SALE_VOID_EXECUTED`
  - actionKey: `sale.void.execute`
  - outcome: `SUCCESS`
  - entityType: `sale`
  - canonical endpoint metadata: `/v0/sales/:saleId/void/execute`

Verification note:
- command atomicity/idempotency/pull-delta integration coverage is in `src/integration-tests/v0-sale-order.int.test.ts`.
- no sale/order event subscribers are wired yet; events are currently producer-only.

### Receipt
- `RECEIPT_PRINT_REQUESTED`
  - actionKey: `receipt.print`
  - outcome: `SUCCESS`
  - entityType: `receipt`
  - canonical endpoint metadata: `/v0/receipts/:receiptId/print`
- `RECEIPT_REPRINT_REQUESTED`
  - actionKey: `receipt.reprint`
  - outcome: `SUCCESS`
  - entityType: `receipt`
  - canonical endpoint metadata: `/v0/receipts/:receiptId/reprint`

Verification note:
- print/reprint command outbox coverage is in `src/modules/v0/posOperation/receipt/api/router.ts`.
- receipt module no longer emits `RECEIPT_CREATED`; receipt payload is sale-derived (`receiptId == saleId`) and delivered inline on sale finalize/KHQR confirm responses.

### Reporting
- Reporting query endpoints under `/v0/reports/*` are read-only and do **not** insert rows into `v0_command_outbox`.
- Observational access logging is captured in `v0_audit_events` with:
  - actionKey: `REPORT_VIEWED`
  - outcome: `SUCCESS`
  - entityType: `report`
  - metadata carries report type + scope echo (`branchScope`, `branchId`, `from`, `to`, `timezone`)

Verification note:
- reporting read-path + scope/role enforcement coverage is in `src/integration-tests/v0-reporting.int.test.ts`.

### Offline Sync (foundation behavior note)
- `pushSync.apply` is a replay orchestrator action and does not currently emit dedicated outbox event types.
- it routes to underlying command handlers; domain events are emitted by those underlying commands when applicable.
- replay outcomes are persisted in `v0_offline_sync_operations` / `v0_offline_sync_batches` and exposed via API.

## Notes

- Dispatcher currently uses at-least-once delivery semantics.
- Subscribers must be idempotent.
- Duplicate `dedupeKey` writes are prevented per tenant at outbox insert time.
