# Policy Module — API Contract (Frontend)

This document describes the **current** Policy HTTP contract exposed by the backend.

**Base path:** `/v1/policies`  
**Auth header:** `Authorization: Bearer <accessToken>`

---

## Conventions

### IDs
- All IDs are UUID strings.

### Casing
- Policy module uses `camelCase` in request/response bodies.

### Branch scope
- Policies are **branch-scoped**.
- Most endpoints accept `branchId` (query for GET, body for PATCH). If omitted, the authenticated user's branch is used.

---

## Types

### `TenantPolicies` (combined view)
```ts
type TenantPolicies = {
  tenantId: string;
  branchId: string;

  saleVatEnabled: boolean;
  saleVatRatePercent: number;
  saleFxRateKhrPerUsd: number;
  saleKhrRoundingEnabled: boolean;
  saleKhrRoundingMode: "NEAREST" | "UP" | "DOWN";
  saleKhrRoundingGranularity: "100" | "1000";

  inventoryAutoSubtractOnSale: boolean;
  inventoryExpiryTrackingEnabled: boolean;

  cashAllowPaidOut: boolean;
  cashRequireRefundApproval: boolean;
  cashAllowManualAdjustment: boolean;

  attendanceAutoFromCashSession: boolean;
  attendanceRequireOutOfShiftApproval: boolean;
  attendanceEarlyCheckinBufferEnabled: boolean;
  attendanceCheckinBufferMinutes: number;
  attendanceAllowManagerEdits: boolean;

  createdAt: string; // ISO date-time
  updatedAt: string; // ISO date-time
};
```

### `SalesPolicies`
```ts
type SalesPolicies = {
  tenantId: string;
  branchId: string;
  vatEnabled: boolean;
  vatRatePercent: number;
  fxRateKhrPerUsd: number;
  khrRoundingEnabled: boolean;
  khrRoundingMode: "NEAREST" | "UP" | "DOWN";
  khrRoundingGranularity: "100" | "1000";
  createdAt: string;
  updatedAt: string;
};
```

### `InventoryPolicies`
```ts
type InventoryPolicies = {
  tenantId: string;
  branchId: string;
  autoSubtractOnSale: boolean;
  expiryTrackingEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};
```

### `CashSessionPolicies`
```ts
type CashSessionPolicies = {
  tenantId: string;
  branchId: string;
  requireSessionForSales: boolean;
  allowPaidOut: boolean;
  requireRefundApproval: boolean;
  allowManualAdjustment: boolean;
  createdAt: string;
  updatedAt: string;
};
```

### `AttendancePolicies`
```ts
type AttendancePolicies = {
  tenantId: string;
  branchId: string;
  autoFromCashSession: boolean;
  requireOutOfShiftApproval: boolean;
  earlyCheckinBufferEnabled: boolean;
  checkinBufferMinutes: number;
  allowManagerEdits: boolean;
  createdAt: string;
  updatedAt: string;
};
```

---

## Endpoints

### 1) Get all policies (combined view)
`GET /v1/policies?branchId=uuid`

Hint: This endpoint is branch-scoped. If `branchId` is omitted, the authenticated user's branch is used.

Response `200`:
```json
{
  "tenantId": "uuid",
  "branchId": "uuid",
  "saleVatEnabled": true,
  "saleVatRatePercent": 10,
  "saleFxRateKhrPerUsd": 4100,
  "saleKhrRoundingEnabled": true,
  "saleKhrRoundingMode": "NEAREST",
  "saleKhrRoundingGranularity": "100",
  "inventoryAutoSubtractOnSale": true,
  "inventoryExpiryTrackingEnabled": false,
  "cashAllowPaidOut": false,
  "cashRequireRefundApproval": false,
  "cashAllowManualAdjustment": false,
  "attendanceAutoFromCashSession": false,
  "attendanceRequireOutOfShiftApproval": false,
  "attendanceEarlyCheckinBufferEnabled": false,
  "attendanceCheckinBufferMinutes": 15,
  "attendanceAllowManagerEdits": false,
  "createdAt": "2025-12-23T00:00:00.000Z",
  "updatedAt": "2025-12-23T00:00:00.000Z"
}
```

Errors:
- `400` if branchId cannot be resolved
- `401` if missing/invalid auth
- `404` if policies are missing and defaults cannot be created

---

### 2) Get sales policies
`GET /v1/policies/sales?branchId=uuid`

Response `200`:
```json
{
  "tenantId": "uuid",
  "branchId": "uuid",
  "vatEnabled": true,
  "vatRatePercent": 10,
  "fxRateKhrPerUsd": 4100,
  "khrRoundingEnabled": true,
  "khrRoundingMode": "NEAREST",
  "khrRoundingGranularity": "100",
  "createdAt": "2025-12-23T00:00:00.000Z",
  "updatedAt": "2025-12-23T00:00:00.000Z"
}
```

---

### 3) Get inventory policies
`GET /v1/policies/inventory?branchId=uuid`

Response `200`:
```json
{
  "tenantId": "uuid",
  "branchId": "uuid",
  "autoSubtractOnSale": true,
  "expiryTrackingEnabled": false,
  "createdAt": "2025-12-23T00:00:00.000Z",
  "updatedAt": "2025-12-23T00:00:00.000Z"
}
```

---

### 4) Get cash session policies
`GET /v1/policies/cash-sessions?branchId=uuid`

Response `200`:
```json
{
  "tenantId": "uuid",
  "branchId": "uuid",
  "allowPaidOut": false,
  "requireRefundApproval": false,
  "allowManualAdjustment": false,
  "createdAt": "2025-12-23T00:00:00.000Z",
  "updatedAt": "2025-12-23T00:00:00.000Z"
}
```

---

### 5) Get attendance policies
`GET /v1/policies/attendance?branchId=uuid`

Response `200`:
```json
{
  "tenantId": "uuid",
  "branchId": "uuid",
  "autoFromCashSession": false,
  "requireOutOfShiftApproval": false,
  "earlyCheckinBufferEnabled": false,
  "checkinBufferMinutes": 15,
  "allowManagerEdits": false,
  "createdAt": "2025-12-23T00:00:00.000Z",
  "updatedAt": "2025-12-23T00:00:00.000Z"
}
```

---

### 6) Update tax policies (Admin only)
`PATCH /v1/policies/tax`

Body (all optional):
```json
{
  "branchId": "uuid",
  "saleVatEnabled": true,
  "saleVatRatePercent": 10
}
```

Response `200`:
```json
{
  "tenantId": "uuid",
  "branchId": "uuid",
  "vatEnabled": true,
  "vatRatePercent": 10,
  "updatedAt": "2025-12-23T00:00:00.000Z"
}
```

---

### 7) Update currency policies (Admin only)
`PATCH /v1/policies/currency`

Body (all optional):
```json
{
  "branchId": "uuid",
  "saleFxRateKhrPerUsd": 4100
}
```

Response `200`:
```json
{
  "tenantId": "uuid",
  "branchId": "uuid",
  "fxRateKhrPerUsd": 4100,
  "updatedAt": "2025-12-23T00:00:00.000Z"
}
```

---

### 8) Update rounding policies (Admin only)
`PATCH /v1/policies/rounding`

Body (all optional):
```json
{
  "branchId": "uuid",
  "saleKhrRoundingEnabled": true,
  "saleKhrRoundingMode": "NEAREST",
  "saleKhrRoundingGranularity": "100"
}
```

Response `200`:
```json
{
  "tenantId": "uuid",
  "branchId": "uuid",
  "khrRoundingEnabled": true,
  "khrRoundingMode": "NEAREST",
  "khrRoundingGranularity": "100",
  "updatedAt": "2025-12-23T00:00:00.000Z"
}
```

---

### 9) Update inventory policies (Admin only)
`PATCH /v1/policies/inventory`

Body (all optional):
```json
{
  "branchId": "uuid",
  "inventoryAutoSubtractOnSale": true,
  "inventoryExpiryTrackingEnabled": false
}
```

Response `200`:
```json
{
  "tenantId": "uuid",
  "branchId": "uuid",
  "autoSubtractOnSale": true,
  "expiryTrackingEnabled": false,
  "updatedAt": "2025-12-23T00:00:00.000Z"
}
```

---

### 10) Update cash session policies (Admin only)
`PATCH /v1/policies/cash-sessions`

Body (all optional):
```json
{
  "branchId": "uuid",
  "cashAllowPaidOut": false,
  "cashRequireRefundApproval": false,
  "cashAllowManualAdjustment": false
}
```

Response `200`:
```json
{
  "tenantId": "uuid",
  "branchId": "uuid",
  "allowPaidOut": false,
  "requireRefundApproval": false,
  "allowManualAdjustment": false,
  "updatedAt": "2025-12-23T00:00:00.000Z"
}
```
Note: Cash sessions are enforced by product policy; sales still require an active session even if `cashRequireSessionForSales` is set to `false`.

---

### 11) Update attendance policies (Admin only)
`PATCH /v1/policies/attendance`

Body (all optional):
```json
{
  "branchId": "uuid",
  "attendanceAutoFromCashSession": false,
  "attendanceRequireOutOfShiftApproval": false,
  "attendanceEarlyCheckinBufferEnabled": false,
  "attendanceCheckinBufferMinutes": 15,
  "attendanceAllowManagerEdits": false
}
```

Response `200`:
```json
{
  "tenantId": "uuid",
  "branchId": "uuid",
  "autoFromCashSession": false,
  "requireOutOfShiftApproval": false,
  "earlyCheckinBufferEnabled": false,
  "checkinBufferMinutes": 15,
  "allowManagerEdits": false,
  "updatedAt": "2025-12-23T00:00:00.000Z"
}
```

---

## Notes
- PATCH routes are admin-only.
- Audit logs are emitted for policy updates (with old/new values).
