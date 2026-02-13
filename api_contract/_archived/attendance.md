# Staff Attendance Module — API Contract (Frontend)

This document describes the **current** Staff Attendance HTTP contract exposed by the backend.

**Base path:** `/v1/attendance`  
**Auth header:** `Authorization: Bearer <accessToken>`

---

## Conventions

### IDs
- All IDs are UUID strings.

### Casing
- Attendance module uses `camelCase` in request/response bodies.

### Access
- Attendance data is **read-only** for history (no edits/deletes).
- Roles:
  - `ADMIN`: view attendance across all branches, approve/reject requests.
  - `MANAGER`: view attendance within own branch, approve/reject requests in own branch.
  - `CASHIER`: view only their own attendance history.

---

## Types

### `AttendanceRecordType`
```ts
type AttendanceRecordType = "CHECK_IN" | "CHECK_OUT";
```

### `AttendanceRecord`
```ts
type AttendanceRecord = {
  id: string;
  tenantId: string;
  branchId: string;
  employeeId: string;
  type: AttendanceRecordType;
  occurredAt: string; // ISO date-time
  location?: { lat: number; lng: number } | null;
  createdAt: string; // ISO date-time
};
```

### `AttendanceRequestStatus`
```ts
type AttendanceRequestStatus = "PENDING" | "APPROVED" | "REJECTED";
```

### `AttendanceRequest`
```ts
type AttendanceRequest = {
  id: string;
  tenantId: string;
  branchId: string;
  employeeId: string;
  requestType: "CHECK_IN";
  status: AttendanceRequestStatus;
  requestedAt: string; // ISO date-time
  requestedCheckInAt: string; // ISO date-time
  resolvedAt: string | null; // ISO date-time
  resolvedBy: string | null; // employeeId
  attendanceRecordId: string | null;
  note: string | null;
  createdAt: string; // ISO date-time
  updatedAt: string; // ISO date-time
};
```

### `CheckInResult`
```ts
type CheckInResult =
  | { status: "CHECKED_IN"; record: AttendanceRecord }
  | { status: "PENDING_APPROVAL"; request: AttendanceRequest };
```

---

## Endpoints

### 1) Check in
`POST /v1/attendance/check-in`

Body:
```json
{
  "occurredAt": "2025-12-23T08:00:00.000Z",
  "location": { "lat": 11.5564, "lng": 104.9282 },
  "shiftStatus": "IN_SHIFT",
  "earlyMinutes": 5,
  "note": "Arrived early"
}
```

Notes:
- `shiftStatus` accepts `IN_SHIFT | EARLY | OUT_OF_SHIFT`.
- `earlyMinutes` is used only when `shiftStatus = EARLY`.

Response `200`:
```json
{
  "success": true,
  "data": {
    "status": "CHECKED_IN",
    "record": {
      "id": "uuid",
      "tenantId": "uuid",
      "branchId": "uuid",
      "employeeId": "uuid",
      "type": "CHECK_IN",
      "occurredAt": "2025-12-23T08:00:00.000Z",
      "location": null,
      "createdAt": "2025-12-23T08:00:01.000Z"
    }
  }
}
```

Response `200` (approval required):
```json
{
  "success": true,
  "data": {
    "status": "PENDING_APPROVAL",
    "request": {
      "id": "uuid",
      "tenantId": "uuid",
      "branchId": "uuid",
      "employeeId": "uuid",
      "requestType": "CHECK_IN",
      "status": "PENDING",
      "requestedAt": "2025-12-23T08:00:00.000Z",
      "requestedCheckInAt": "2025-12-23T08:00:00.000Z",
      "resolvedAt": null,
      "resolvedBy": null,
      "attendanceRecordId": null,
      "note": "Arrived early",
      "createdAt": "2025-12-23T08:00:01.000Z",
      "updatedAt": "2025-12-23T08:00:01.000Z"
    }
  }
}
```

Errors:
- `400` if already checked in or policy requires approval
- `401` if missing/invalid auth
- `403` if role not allowed

---

### 2) Check out
`POST /v1/attendance/check-out`

Body:
```json
{
  "occurredAt": "2025-12-23T17:00:00.000Z",
  "location": { "lat": 11.5564, "lng": 104.9282 }
}
```

Response `200`:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "tenantId": "uuid",
    "branchId": "uuid",
    "employeeId": "uuid",
    "type": "CHECK_OUT",
    "occurredAt": "2025-12-23T17:00:00.000Z",
    "location": null,
    "createdAt": "2025-12-23T17:00:01.000Z"
  }
}
```

Errors:
- `400` if no active check-in
- `401` if missing/invalid auth
- `403` if role not allowed

---

### 3) List own attendance
`GET /v1/attendance/me?branchId=uuid&from=ISO&to=ISO&limit=100&offset=0`

Query:
- `branchId` optional (defaults to user branch)
- `from` optional (ISO date-time, filters `occurredAt`)
- `to` optional (ISO date-time, filters `occurredAt`)
- `limit` optional (default `100`)
- `offset` optional (default `0`)

Response `200`:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "tenantId": "uuid",
      "branchId": "uuid",
      "employeeId": "uuid",
      "type": "CHECK_IN",
      "occurredAt": "2025-12-23T08:00:00.000Z",
      "location": null,
      "createdAt": "2025-12-23T08:00:01.000Z"
    }
  ]
}
```

Errors:
- `401` if missing/invalid auth
- `403` if branch access denied

---

### 4) List my shift schedule
`GET /v1/attendance/me/shifts?branchId=uuid`

Response `200`:
```json
{
  "success": true,
  "data": [
    { "dayOfWeek": 1, "startTime": "08:00", "endTime": "17:00", "isOff": false },
    { "dayOfWeek": 0, "startTime": null, "endTime": null, "isOff": true }
  ]
}
```

Errors:
- `401` if missing/invalid auth
- `403` if branch access denied

---

### 5) List branch attendance (manager/admin)
`GET /v1/attendance/branch?branchId=uuid&employeeId=uuid&from=ISO&to=ISO&limit=100&offset=0`

Query:
- `branchId` optional (defaults to user branch)
- `employeeId` optional (filter specific staff in branch)
- `from` / `to` optional
- `limit` / `offset` optional

Errors:
- `401` if missing/invalid auth
- `403` if role cannot access the branch

---

### 6) List all attendance (admin only)
`GET /v1/attendance/all?branchId=uuid&employeeId=uuid&from=ISO&to=ISO&limit=100&offset=0`

Errors:
- `401` if missing/invalid auth
- `403` if role is not `ADMIN`

---

### 7) Approve out-of-shift request (manager/admin)
`POST /v1/attendance/requests/:requestId/approve`

Response `200`:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "APPROVED",
    "attendanceRecordId": "uuid"
  }
}
```

Errors:
- `400` if request not found or already resolved
- `401` if missing/invalid auth
- `403` if role cannot approve

---

### 8) Reject out-of-shift request (manager/admin)
`POST /v1/attendance/requests/:requestId/reject`

Response `200`:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "REJECTED",
    "attendanceRecordId": null
  }
}
```

Errors:
- `400` if request not found or already resolved
- `401` if missing/invalid auth
- `403` if role cannot reject
