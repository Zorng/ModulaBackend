# Policy Module - Swagger/OpenAPI Testing Guide

Complete guide for testing the Policy Module API using Swagger UI or any OpenAPI-compatible tool.

**Base URL**: `/v1/policies`  
**Authentication**: Bearer token required for all endpoints  
**Authorization**: ADMIN role required for all policy operations

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Authentication](#authentication)
3. [API Endpoints](#api-endpoints)
4. [Request Examples](#request-examples)
5. [Response Examples](#response-examples)
6. [Testing Scenarios](#testing-scenarios)
7. [Error Handling](#error-handling)

---

## Quick Start

### Prerequisites

#### 1. Get an ADMIN token

```bash
POST /v1/auth/login
{
  "email": "admin@example.com",
  "password": "your-password"
}
```

Save the `accessToken` from the response.

#### 2. Set Authorization Header

```text
Authorization: Bearer {your-access-token}
```

#### 3. Ensure tenant has policies

Policies are auto-created with defaults on first GET request if they don't exist.

---

## Authentication

All endpoints require:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Token Claims Required:**

- `tenantId` - The tenant the user belongs to
- `employeeId` - The authenticated employee
- `branchId` - User's assigned branch
- `role` - Must be `"ADMIN"`

**Error Responses:**

- `401 Unauthorized` - Missing or invalid token
- `403 Forbidden` - User is not ADMIN

---

## API Endpoints

### 1. Get All Policies

```http
GET /v1/policies
```

**Description:** Retrieves all policy settings for the tenant in a single combined view.

**Returns:** Combined policies from all 4 tables (sales, inventory, cash_session, attendance).

**Use Case:** Initial load of settings screen, sync policies to frontend state.

---

### 2. Get Sales Policies

```http
GET /v1/policies/sales
```

**Description:** Get tax, currency, and rounding settings only.

**Fields Returned:**

- `vatEnabled` - Apply VAT at checkout (boolean)
- `vatRatePercent` - VAT rate (0-100)
- `fxRateKhrPerUsd` - Exchange rate KHR per 1 USD (1000-10000)
- `khrRoundingMode` - Rounding method: "NEAREST" | "UP" | "DOWN"

**Use Case:** Sales module reads these policies to calculate checkout totals.

---

### 3. Get Inventory Policies

```http
GET /v1/policies/inventory
```

**Description:** Get inventory behavior settings only.

**Fields Returned:**

- `autoSubtractOnSale` - Automatically deduct stock when sale finalized (boolean)
- `expiryTrackingEnabled` - Track product expiry dates (boolean)

**Use Case:** Inventory module reads this to decide if stock should be auto-deducted.

---

### 4. Get Cash Session Policies

```http
GET /v1/policies/cash-sessions
```

**Description:** Get cash handling control settings only.

**Fields Returned:**

- `requireSessionForSales` - Require active cash session to make sales (boolean)
- `allowPaidOut` - Allow paid-out transactions during shift (boolean)
- `requireRefundApproval` - Require manager approval for cash refunds (boolean)
- `allowManualAdjustment` - Allow manual cash adjustments (boolean)

**Use Case:** Cash session module (future) will use these to enforce cash handling rules.

---

### 5. Get Attendance Policies

```http
GET /v1/policies/attendance
```

**Description:** Get attendance and shift management settings only.

**Fields Returned:**

- `autoFromCashSession` - Auto-mark attendance from cash session (boolean)
- `requireOutOfShiftApproval` - Require approval for out-of-shift actions (boolean)
- `earlyCheckinBufferEnabled` - Allow early check-in within buffer period (boolean)
- `checkinBufferMinutes` - Minutes before shift start for early check-in (0-120)
- `allowManagerEdits` - Allow managers to edit attendance records (boolean)

**Use Case:** Attendance module (future) will use these for shift management rules.

---

### 6. Update Policies

```http
PATCH /v1/policies
```

**Description:** Update one or more policy settings. All fields are optional (partial update).

**Request Body:** See [Update Request Schema](#update-request-schema) below.

**Validation:**

- At least one field must be provided
- Field-specific constraints (see schema)
- Unknown fields are rejected (strict mode)

**Use Case:** Settings screen saves user changes to policies.

---

## Request Examples

### Update Request Schema

All fields are **optional**. Only provide the fields you want to update.

```json
{
  // ==================== TAX & CURRENCY ====================
  "saleVatEnabled": true,                    // boolean
  "saleVatRatePercent": 10.0,                // number: 0-100
  "saleFxRateKhrPerUsd": 4100.0,             // number: 1000-10000
  "saleKhrRoundingMode": "NEAREST",          // "NEAREST" | "UP" | "DOWN"

  // ==================== INVENTORY BEHAVIOR ====================
  "inventoryAutoSubtractOnSale": true,       // boolean
  "inventoryExpiryTrackingEnabled": false,   // boolean

  // ==================== CASH SESSIONS CONTROL ====================
  "cashRequireSessionForSales": true,        // boolean
  "cashAllowPaidOut": true,                  // boolean
  "cashRequireRefundApproval": false,        // boolean
  "cashAllowManualAdjustment": false,        // boolean

  // ==================== ATTENDANCE & SHIFTS ====================
  "attendanceAutoFromCashSession": false,    // boolean
  "attendanceRequireOutOfShiftApproval": false,  // boolean
  "attendanceEarlyCheckinBufferEnabled": false,  // boolean
  "attendanceCheckinBufferMinutes": 15,      // number: 0-120 (integer)
  "attendanceAllowManagerEdits": false       // boolean
}
```

### Example 1: Enable VAT

```json
{
  "saleVatEnabled": true,
  "saleVatRatePercent": 10
}
```

### Example 2: Update FX Rate

```json
{
  "saleFxRateKhrPerUsd": 4150
}
```

### Example 3: Disable Auto Inventory Deduction

```json
{
  "inventoryAutoSubtractOnSale": false
}
```

### Example 4: Enable Early Check-in Buffer

```json
{
  "attendanceEarlyCheckinBufferEnabled": true,
  "attendanceCheckinBufferMinutes": 30
}
```

### Example 5: Update Multiple Policies

```json
{
  "saleVatEnabled": true,
  "saleVatRatePercent": 10,
  "saleFxRateKhrPerUsd": 4100,
  "saleKhrRoundingMode": "UP",
  "inventoryAutoSubtractOnSale": true,
  "cashRequireSessionForSales": true
}
```

---

## Response Examples

### GET /v1/policies (All Policies)

```json
{
  "success": true,
  "data": {
    "tenantId": "550e8400-e29b-41d4-a716-446655440000",
    
    "saleVatEnabled": true,
    "saleVatRatePercent": 10,
    "saleFxRateKhrPerUsd": 4100,
    "saleKhrRoundingMode": "NEAREST",
    
    "inventoryAutoSubtractOnSale": true,
    "inventoryExpiryTrackingEnabled": false,
    
    "cashRequireSessionForSales": true,
    "cashAllowPaidOut": true,
    "cashRequireRefundApproval": false,
    "cashAllowManualAdjustment": false,
    
    "attendanceAutoFromCashSession": false,
    "attendanceRequireOutOfShiftApproval": false,
    "attendanceEarlyCheckinBufferEnabled": false,
    "attendanceCheckinBufferMinutes": 15,
    "attendanceAllowManagerEdits": false,
    
    "createdAt": "2025-12-01T10:00:00.000Z",
    "updatedAt": "2025-12-02T15:30:00.000Z"
  }
}
```

### GET /v1/policies/sales

```json
{
  "success": true,
  "data": {
    "tenantId": "550e8400-e29b-41d4-a716-446655440000",
    "vatEnabled": true,
    "vatRatePercent": 10,
    "fxRateKhrPerUsd": 4100,
    "khrRoundingMode": "NEAREST",
    "createdAt": "2025-12-01T10:00:00.000Z",
    "updatedAt": "2025-12-02T15:30:00.000Z"
  }
}
```

### GET /v1/policies/inventory

```json
{
  "success": true,
  "data": {
    "tenantId": "550e8400-e29b-41d4-a716-446655440000",
    "autoSubtractOnSale": true,
    "expiryTrackingEnabled": false,
    "createdAt": "2025-12-01T10:00:00.000Z",
    "updatedAt": "2025-12-02T14:00:00.000Z"
  }
}
```

### PATCH /v1/policies (Update Success)

```json
{
  "success": true,
  "data": {
    "tenantId": "550e8400-e29b-41d4-a716-446655440000",
    "saleVatEnabled": true,
    "saleVatRatePercent": 10,
    "saleFxRateKhrPerUsd": 4150,
    "saleKhrRoundingMode": "UP",
    "inventoryAutoSubtractOnSale": true,
    "inventoryExpiryTrackingEnabled": false,
    "cashRequireSessionForSales": true,
    "cashAllowPaidOut": true,
    "cashRequireRefundApproval": false,
    "cashAllowManualAdjustment": false,
    "attendanceAutoFromCashSession": false,
    "attendanceRequireOutOfShiftApproval": false,
    "attendanceEarlyCheckinBufferEnabled": false,
    "attendanceCheckinBufferMinutes": 15,
    "attendanceAllowManagerEdits": false,
    "createdAt": "2025-12-01T10:00:00.000Z",
    "updatedAt": "2025-12-02T16:45:30.000Z"
  }
}
```

---

## Testing Scenarios

### Scenario 1: View Current Settings

**Goal:** Load all policies for the settings screen

```bash
curl -X GET "http://localhost:3000/v1/policies" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** 200 OK with all policies

**Verify:**

- ✓ All fields present
- ✓ Values match database
- ✓ Timestamps are valid

---

### Scenario 2: Enable VAT

**Goal:** Turn on VAT with 10% rate

```bash
curl -X PATCH "http://localhost:3000/v1/policies" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "saleVatEnabled": true,
    "saleVatRatePercent": 10
  }'
```

**Expected:** 200 OK with updated policies

**Verify:**

- ✓ `saleVatEnabled` is `true`
- ✓ `saleVatRatePercent` is `10`
- ✓ `updatedAt` timestamp changed
- ✓ Other fields unchanged

**Test Impact:**

- Create a sale and verify VAT is applied at checkout

---

### Scenario 3: Change FX Rate

**Goal:** Update exchange rate to 4150

```bash
curl -X PATCH "http://localhost:3000/v1/policies" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "saleFxRateKhrPerUsd": 4150
  }'
```

**Expected:** 200 OK

**Verify:**

- ✓ `saleFxRateKhrPerUsd` is `4150`

**Test Impact:**

- Create a sale with KHR tender currency
- Verify conversion uses new rate (4150)

---

### Scenario 4: Disable Auto Inventory Deduction

**Goal:** Prevent automatic stock subtraction

```bash
curl -X PATCH "http://localhost:3000/v1/policies" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "inventoryAutoSubtractOnSale": false
  }'
```

**Expected:** 200 OK

**Verify:**

- ✓ `inventoryAutoSubtractOnSale` is `false`

**Test Impact:**

- Finalize a sale
- Check inventory journal - should NOT have `SALE_DEDUCTION` entry
- Stock on-hand should remain unchanged

---

### Scenario 5: Configure Attendance Buffer

**Goal:** Allow early check-in 30 minutes before shift

```bash
curl -X PATCH "http://localhost:3000/v1/policies" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "attendanceEarlyCheckinBufferEnabled": true,
    "attendanceCheckinBufferMinutes": 30
  }'
```

**Expected:** 200 OK

**Verify:**

- ✓ `attendanceEarlyCheckinBufferEnabled` is `true`
- ✓ `attendanceCheckinBufferMinutes` is `30`

**Test Impact (when attendance module is implemented):**

- Shift starts at 09:00
- Employee can check-in at 08:30 (30 min before)
- Employee cannot check-in at 08:29 (31 min before)

---

### Scenario 6: Batch Update Multiple Settings

**Goal:** Update multiple policies in one request

```bash
curl -X PATCH "http://localhost:3000/v1/policies" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "saleVatEnabled": true,
    "saleVatRatePercent": 10,
    "saleFxRateKhrPerUsd": 4100,
    "saleKhrRoundingMode": "UP",
    "inventoryAutoSubtractOnSale": true,
    "inventoryExpiryTrackingEnabled": true,
    "cashRequireSessionForSales": true,
    "cashAllowPaidOut": false
  }'
```

**Expected:** 200 OK

**Verify:**

- ✓ All 8 fields updated correctly
- ✓ Single `updatedAt` timestamp
- ✓ Transaction successful (all or nothing)

---

### Scenario 7: Invalid Input - VAT Rate Out of Range

**Goal:** Test validation (VAT > 100)

```bash
curl -X PATCH "http://localhost:3000/v1/policies" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "saleVatRatePercent": 150
  }'
```

**Expected:** 400 Bad Request

**Response:**

```json
{
  "success": false,
  "error": "Validation failed",
  "issues": [
    {
      "path": ["saleVatRatePercent"],
      "message": "Number must be less than or equal to 100"
    }
  ]
}
```

---

### Scenario 8: Invalid Input - Unknown Field

**Goal:** Test strict schema validation

```bash
curl -X PATCH "http://localhost:3000/v1/policies" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "unknownField": true
  }'
```

**Expected:** 400 Bad Request

**Response:**

```json
{
  "success": false,
  "error": "Validation failed",
  "issues": [
    {
      "path": ["unknownField"],
      "message": "Unrecognized key(s) in object: 'unknownField'"
    }
  ]
}
```

---

### Scenario 9: Invalid Input - Empty Request

**Goal:** Test required constraint (at least one field)

```bash
curl -X PATCH "http://localhost:3000/v1/policies" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected:** 400 Bad Request

**Response:**

```json
{
  "success": false,
  "error": "Validation failed",
  "issues": [
    {
      "message": "At least one field must be provided for update"
    }
  ]
}
```

---

### Scenario 10: Unauthorized Access - No Token

**Goal:** Test authentication requirement

```bash
curl -X GET "http://localhost:3000/v1/policies"
```

**Expected:** 401 Unauthorized

**Response:**

```json
{
  "error": "Missing or invalid authorization header"
}
```

---

### Scenario 11: Forbidden Access - Non-Admin User

**Goal:** Test authorization requirement

```bash
# Login as CASHIER or WAITER user
POST /v1/auth/login
{
  "email": "cashier@example.com",
  "password": "password"
}

# Try to access policies with cashier token
GET /v1/policies
Authorization: Bearer {cashier-token}
```

**Expected:** 403 Forbidden

**Response:**

```json
{
  "error": "Forbidden",
  "message": "Only ADMIN users can access policy settings. Your role: CASHIER"
}
```

---

## Error Handling

### Error Response Format

All errors follow this format:

```json
{
  "success": false,
  "error": "Error type",
  "message": "Human-readable error message",
  "issues": [
    // Optional: Validation issues array
  ]
}
```

### HTTP Status Codes

| Code | Meaning | When |
|------|---------|------|
| `200` | OK | Successful GET or PATCH |
| `400` | Bad Request | Validation failed |
| `401` | Unauthorized | Missing or invalid token |
| `403` | Forbidden | User is not ADMIN |
| `404` | Not Found | Tenant has no policies (rare, auto-created) |
| `500` | Internal Server Error | Database error, server error |

### Common Errors

#### 1. Validation Errors (400)

```json
{
  "success": false,
  "error": "Validation failed",
  "issues": [
    {
      "path": ["saleVatRatePercent"],
      "message": "Number must be less than or equal to 100"
    }
  ]
}
```

#### 2. Authentication Error (401)

```json
{
  "error": "Missing or invalid authorization header"
}
```

#### 3. Authorization Error (403)

```json
{
  "error": "Forbidden",
  "message": "Only ADMIN users can access policy settings. Your role: CASHIER"
}
```

#### 4. Server Error (500)

```json
{
  "success": false,
  "error": "Failed to update tenant policies"
}
```

---

## Integration Testing

### Testing Policy Impact on Other Modules

#### 1. Test VAT Policy → Sales Module

```bash
# Step 1: Enable VAT at 10%
PATCH /v1/policies
{
  "saleVatEnabled": true,
  "saleVatRatePercent": 10
}

# Step 2: Create a sale
POST /v1/sales
{
  "items": [{"menuItemId": "...", "quantity": 1, "unitPriceUsd": 10}]
}

# Step 3: Finalize sale
POST /v1/sales/:saleId/finalize
{
  "tenderCurrency": "USD",
  "receivedAmountUsd": 11
}

# Verify: totals.taxUsd should be 1.0 (10% of 10)
# Verify: totals.totalDueUsd should be 11.0
```

#### 2. Test Inventory Policy → Inventory Module

```bash
# Step 1: Enable auto-subtract
PATCH /v1/policies
{
  "inventoryAutoSubtractOnSale": true
}

# Step 2: Check initial stock
GET /v1/inventory/journal/on-hand?stockItemId={id}
# Note the onHand quantity (e.g., 100)

# Step 3: Finalize a sale (with menu item mapped to stock)
POST /v1/sales/:saleId/finalize
{...}

# Step 4: Check stock again
GET /v1/inventory/journal/on-hand?stockItemId={id}
# Verify: onHand decreased by qtyPerSale * quantity sold
```

#### 3. Test FX Rate Policy → Sales Module

```bash
# Step 1: Set FX rate to 4100
PATCH /v1/policies
{
  "saleFxRateKhrPerUsd": 4100
}

# Step 2: Create sale with USD items
POST /v1/sales
{
  "items": [{"menuItemId": "...", "quantity": 1, "unitPriceUsd": 1}]
}

# Step 3: Finalize with KHR tender
POST /v1/sales/:saleId/finalize
{
  "tenderCurrency": "KHR",
  "receivedAmountKhr": 5000
}

# Verify: totals.totalDueKhr = 4100 (1 USD * 4100 rate)
# Verify: fxRateUsed = 4100
```

---

## OpenAPI/Swagger Spec

### Complete OpenAPI YAML

```yaml
openapi: 3.0.0
info:
  title: Policy Module API
  description: Tenant-level policy configuration for POS system
  version: 1.0.0
servers:
  - url: http://localhost:3000/v1
    description: Local development server
  - url: https://api.yourcompany.com/v1
    description: Production server

components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  schemas:
    TenantPolicies:
      type: object
      required:
        - tenantId
        - saleVatEnabled
        - saleVatRatePercent
        - saleFxRateKhrPerUsd
        - saleKhrRoundingMode
        - inventoryAutoSubtractOnSale
        - inventoryExpiryTrackingEnabled
        - cashRequireSessionForSales
        - cashAllowPaidOut
        - cashRequireRefundApproval
        - cashAllowManualAdjustment
        - attendanceAutoFromCashSession
        - attendanceRequireOutOfShiftApproval
        - attendanceEarlyCheckinBufferEnabled
        - attendanceCheckinBufferMinutes
        - attendanceAllowManagerEdits
        - createdAt
        - updatedAt
      properties:
        tenantId:
          type: string
          format: uuid
        saleVatEnabled:
          type: boolean
        saleVatRatePercent:
          type: number
          minimum: 0
          maximum: 100
        saleFxRateKhrPerUsd:
          type: number
          minimum: 1000
          maximum: 10000
        saleKhrRoundingMode:
          type: string
          enum: [NEAREST, UP, DOWN]
        inventoryAutoSubtractOnSale:
          type: boolean
        inventoryExpiryTrackingEnabled:
          type: boolean
        cashRequireSessionForSales:
          type: boolean
        cashAllowPaidOut:
          type: boolean
        cashRequireRefundApproval:
          type: boolean
        cashAllowManualAdjustment:
          type: boolean
        attendanceAutoFromCashSession:
          type: boolean
        attendanceRequireOutOfShiftApproval:
          type: boolean
        attendanceEarlyCheckinBufferEnabled:
          type: boolean
        attendanceCheckinBufferMinutes:
          type: integer
          minimum: 0
          maximum: 120
        attendanceAllowManagerEdits:
          type: boolean
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time

    UpdatePoliciesRequest:
      type: object
      minProperties: 1
      properties:
        saleVatEnabled:
          type: boolean
        saleVatRatePercent:
          type: number
          minimum: 0
          maximum: 100
        saleFxRateKhrPerUsd:
          type: number
          minimum: 1000
          maximum: 10000
        saleKhrRoundingMode:
          type: string
          enum: [NEAREST, UP, DOWN]
        inventoryAutoSubtractOnSale:
          type: boolean
        inventoryExpiryTrackingEnabled:
          type: boolean
        cashRequireSessionForSales:
          type: boolean
        cashAllowPaidOut:
          type: boolean
        cashRequireRefundApproval:
          type: boolean
        cashAllowManualAdjustment:
          type: boolean
        attendanceAutoFromCashSession:
          type: boolean
        attendanceRequireOutOfShiftApproval:
          type: boolean
        attendanceEarlyCheckinBufferEnabled:
          type: boolean
        attendanceCheckinBufferMinutes:
          type: integer
          minimum: 0
          maximum: 120
        attendanceAllowManagerEdits:
          type: boolean

    Error:
      type: object
      required:
        - success
        - error
      properties:
        success:
          type: boolean
          example: false
        error:
          type: string
        message:
          type: string
        issues:
          type: array
          items:
            type: object

security:
  - BearerAuth: []

paths:
  /policies:
    get:
      summary: Get all tenant policies
      tags:
        - Policies
      responses:
        '200':
          description: Successfully retrieved policies
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                    example: true
                  data:
                    $ref: '#/components/schemas/TenantPolicies'
        '401':
          description: Unauthorized
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '403':
          description: Forbidden - Not ADMIN
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

    patch:
      summary: Update tenant policies
      tags:
        - Policies
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UpdatePoliciesRequest'
            examples:
              enableVAT:
                summary: Enable VAT
                value:
                  saleVatEnabled: true
                  saleVatRatePercent: 10
              updateFX:
                summary: Update FX Rate
                value:
                  saleFxRateKhrPerUsd: 4150
              multipleUpdates:
                summary: Update Multiple Policies
                value:
                  saleVatEnabled: true
                  saleVatRatePercent: 10
                  inventoryAutoSubtractOnSale: true
      responses:
        '200':
          description: Successfully updated policies
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                    example: true
                  data:
                    $ref: '#/components/schemas/TenantPolicies'
        '400':
          description: Validation failed
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '401':
          description: Unauthorized
        '403':
          description: Forbidden - Not ADMIN

  /policies/sales:
    get:
      summary: Get sales policies only
      tags:
        - Policies
      responses:
        '200':
          description: Successfully retrieved sales policies
        '401':
          description: Unauthorized
        '403':
          description: Forbidden - Not ADMIN

  /policies/inventory:
    get:
      summary: Get inventory policies only
      tags:
        - Policies
      responses:
        '200':
          description: Successfully retrieved inventory policies
        '401':
          description: Unauthorized
        '403':
          description: Forbidden - Not ADMIN

  /policies/cash-sessions:
    get:
      summary: Get cash session policies only
      tags:
        - Policies
      responses:
        '200':
          description: Successfully retrieved cash session policies
        '401':
          description: Unauthorized
        '403':
          description: Forbidden - Not ADMIN

  /policies/attendance:
    get:
      summary: Get attendance policies only
      tags:
        - Policies
      responses:
        '200':
          description: Successfully retrieved attendance policies
        '401':
          description: Unauthorized
        '403':
          description: Forbidden - Not ADMIN
```

---

## Postman Collection

You can import this JSON into Postman for quick testing:

```json
{
  "info": {
    "name": "Policy Module API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "auth": {
    "type": "bearer",
    "bearer": [
      {
        "key": "token",
        "value": "{{access_token}}",
        "type": "string"
      }
    ]
  },
  "variable": [
    {
      "key": "base_url",
      "value": "http://localhost:3000/v1"
    },
    {
      "key": "access_token",
      "value": ""
    }
  ],
  "item": [
    {
      "name": "Get All Policies",
      "request": {
        "method": "GET",
        "url": "{{base_url}}/policies"
      }
    },
    {
      "name": "Get Sales Policies",
      "request": {
        "method": "GET",
        "url": "{{base_url}}/policies/sales"
      }
    },
    {
      "name": "Get Inventory Policies",
      "request": {
        "method": "GET",
        "url": "{{base_url}}/policies/inventory"
      }
    },
    {
      "name": "Update Policies - Enable VAT",
      "request": {
        "method": "PATCH",
        "url": "{{base_url}}/policies",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"saleVatEnabled\": true,\n  \"saleVatRatePercent\": 10\n}"
        }
      }
    },
    {
      "name": "Update Policies - Change FX Rate",
      "request": {
        "method": "PATCH",
        "url": "{{base_url}}/policies",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"saleFxRateKhrPerUsd\": 4150\n}"
        }
      }
    }
  ]
}
```

---

## Best Practices

### 1. Always Use ADMIN Token

```bash
# Good: Login as admin first
POST /v1/auth/login
{
  "email": "admin@example.com",
  "password": "secure-password"
}

# Use returned token
GET /v1/policies
Authorization: Bearer {admin-token}
```

### 2. Partial Updates

```bash
# Good: Only send fields you want to change
PATCH /v1/policies
{
  "saleVatRatePercent": 12
}

# Avoid: Sending all fields every time
```

### 3. Test Impact After Changes

```bash
# Always verify policy changes work:
1. Update policy
2. Perform action affected by policy
3. Verify expected behavior
```

### 4. Use Specific Endpoints for Reading

```bash
# If you only need sales policies:
GET /v1/policies/sales  # Better (smaller response)

# Instead of:
GET /v1/policies  # Gets all policies
```

### 5. Handle Validation Errors

```typescript
try {
  const response = await fetch('/v1/policies', {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });

  if (!response.ok) {
    const error = await response.json();
    if (error.issues) {
      // Show validation errors to user
      console.error('Validation failed:', error.issues);
    }
  }
} catch (err) {
  console.error('Network error:', err);
}
```

---

## Troubleshooting

### Problem: 401 Unauthorized

**Cause:** Missing or invalid token

**Solution:**

1. Verify token is in `Authorization: Bearer {token}` header
2. Check token hasn't expired
3. Re-login to get fresh token

### Problem: 403 Forbidden

**Cause:** User is not ADMIN

**Solution:**

1. Login with an ADMIN user account
2. Verify user role in database
3. Ask system administrator to grant ADMIN role

### Problem: 400 Validation Error

**Cause:** Invalid input values

**Solution:**

1. Check `issues` array in response for specific errors
2. Verify field constraints (min/max, enum values)
3. Ensure at least one field provided for PATCH

### Problem: Policies Not Applied

**Cause:** Module not reading policies correctly

**Solution:**

1. Check policy values with GET /v1/policies
2. Verify module adapter is reading from correct table
3. Check module event handlers/use cases
4. Review module integration logs

---

## Summary

- ✅ All endpoints require ADMIN authentication
- ✅ GET endpoints return policy data
- ✅ PATCH endpoint updates policies (partial updates supported)
- ✅ Validation enforced on all inputs
- ✅ Policies auto-created with defaults on first GET
- ✅ Changes immediately available to other modules
- ✅ Full OpenAPI spec provided for Swagger UI

**Next Steps:**

1. Import OpenAPI spec into Swagger UI
2. Import Postman collection for quick testing
3. Test each scenario to verify behavior
4. Integrate frontend with policy endpoints
