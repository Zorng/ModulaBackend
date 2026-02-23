# Receipt Module Boundary (v0)

Status: Phase 1 re-locked  
Owner context: `POSOperation`  
Canonical route prefix: `/v0/receipts`

## 1) Module Identity

- Module name: `receipt`
- Primary KB references:
  - domain/modSpec: `knowledge_base/BusinessLogic/5_modSpec/40_POSOperation/receipt_module_patched.md`
  - process:
    - `knowledge_base/BusinessLogic/4_process/30_POSOperation/10_finalize_sale_orch.md`
    - `knowledge_base/BusinessLogic/4_process/60_PlatformSystems/55_printing_effects_dispatch_process.md`

## 2) Owned Facts (Source of Truth)

- Owned facts:
  - no dedicated receipt persistence table
  - receipt payload is projected at read time from `v0_sales` + `v0_sale_lines`
- Invariants:
  - receipt is available only for sale states: `FINALIZED | VOID_PENDING | VOIDED`
  - `receiptId` is sale-keyed (`receiptId == saleId`)
  - print/reprint never mutate sale/cash/inventory truth

## 3) Consumed Facts (Read Dependencies)

- SaleOrder:
  - sale header + sale line snapshots (already captured by sale-order)
- OrgAccount:
  - tenant/branch existence + status gates
- AccessControl:
  - authorization for read/print/reprint actions
- Printing (future effect module):
  - print request dispatch sink (best-effort operational effect)

## 4) Commands (Write Surface)

- User-triggered commands:
  - `receipt.print`
  - `receipt.reprint`

Transaction contract:
- print/reprint path: observational `audit + outbox` only
- no receipt-owned business row writes

## 5) Queries (Read Surface)

- `receipt.read`
- `receipt.readBySale`
- Scope: `BRANCH / READ` with token context (`tenantId`, `branchId`)
- No tenant/branch override parameters

## 6) Event Contract

### Produced events

- `RECEIPT_PRINT_REQUESTED` (observational/effect trigger)
- `RECEIPT_REPRINT_REQUESTED` (observational/effect trigger)

### Subscribed events

- none (sale finalization already provides receipt-ready payload in command response)

## 7) Access-control Mapping (target)

- `GET /receipts/:receiptId` -> `receipt.read`
- `GET /receipts/sales/:saleId` -> `receipt.readBySale`
- `POST /receipts/:receiptId/print` -> `receipt.print`
- `POST /receipts/:receiptId/reprint` -> `receipt.reprint`

Allowed roles baseline:
- `receipt.read`, `receipt.readBySale`: `OWNER`, `ADMIN`, `MANAGER`, `CASHIER`
- `receipt.print`: `OWNER`, `ADMIN`, `MANAGER`, `CASHIER`
- `receipt.reprint`: `OWNER`, `ADMIN`, `MANAGER`

Entitlement binding:
- baseline `core.pos`

## 8) Deterministic Failure Code Baseline

- `RECEIPT_NOT_FOUND`
- plus standard access/context/subscription denial codes

## 9) Test Requirements

### Unit tests (target)
- mapping from sale rows to receipt payload
- reason-code mapping for print/reprint APIs

### Integration tests (target)
- finalized sale responses include `data.receipt` (sale-order + KHQR confirm)
- read by `receiptId` and by `saleId` with branch isolation
- print/reprint effect signaling does not mutate sale truth
- idempotency replay/conflict for print/reprint writes

## 10) Boundary Guard Checklist

- [x] Owned facts vs consumed facts locked
- [x] Canonical route prefix locked (`/v0/receipts`)
- [x] Action-key namespace locked (`receipt.*`)
- [x] Event ownership list locked
- [x] API contract file target locked (`api_contract/receipt-v0.md`)
