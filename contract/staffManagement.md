# Staff Management Module — API Contract (Frontend)

This document describes the **current** Staff Management HTTP contract exposed by the backend.

**Base path:** `/v1/auth`  
**Auth header:** `Authorization: Bearer <accessToken>`

---

## Conventions

### IDs
- All IDs are UUID strings.

### Casing
- Staff management uses `snake_case` in request/response bodies.

### Access
- Roles:
  - `ADMIN`: full staff management (invites, assignment, role, lifecycle, shifts).
  - `MANAGER`: list staff in own branch only.
  - `CASHIER`: no staff management access.

---

## Types

### `EmployeeStatus`
```ts
type EmployeeStatus = "ACTIVE" | "INVITED" | "DISABLED" | "ARCHIVED";
```

### `EmployeeRole`
```ts
type EmployeeRole = "ADMIN" | "MANAGER" | "CASHIER" | "CLERK";
```

### `StaffListItem`
```ts
type StaffListItem = {
  id: string;
  record_type: "EMPLOYEE" | "INVITE";
  first_name: string;
  last_name: string;
  phone: string;
  status: EmployeeStatus;
  branch_id: string | null;
  branch_name: string | null;
  role: EmployeeRole | null;
  assignment_active: boolean | null;
  created_at: string; // ISO date-time
};
```

### `Invite`
```ts
type Invite = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  role: EmployeeRole;
  branch_id: string;
  expires_at: string; // ISO date-time
};
```

### `ShiftScheduleEntry`
```ts
type ShiftScheduleEntry = {
  day_of_week: number; // 0=Sun ... 6=Sat
  start_time?: string | null; // "HH:MM" or "HH:MM:SS"
  end_time?: string | null;
  is_off: boolean;
};
```

---

## Endpoints

### 1) List staff (admin/manager)
`GET /v1/auth/staff?branch_id=uuid`

Query:
- `branch_id` optional (admins can filter by branch; managers always see own branch)

Response `200`:
```json
{
  "staff": [
    {
      "id": "uuid",
      "record_type": "EMPLOYEE",
      "first_name": "John",
      "last_name": "Smith",
      "phone": "+85512345678",
      "status": "ACTIVE",
      "branch_id": "uuid",
      "branch_name": "Main Branch",
      "role": "CASHIER",
      "assignment_active": true,
      "created_at": "2025-12-23T08:00:00.000Z"
    }
  ]
}
```

Errors:
- `401` if missing/invalid auth
- `403` if role cannot access branch

---

### 2) Create invite (admin)
`POST /v1/auth/invites`

Body:
```json
{
  "first_name": "Jane",
  "last_name": "Doe",
  "phone": "+85598765432",
  "role": "CASHIER",
  "branch_id": "uuid",
  "note": "Evening shift",
  "expires_in_hours": 48
}
```

Response `201`:
```json
{
  "invite": {
    "id": "uuid",
    "first_name": "Jane",
    "last_name": "Doe",
    "phone": "+85598765432",
    "role": "CASHIER",
    "branch_id": "uuid",
    "expires_at": "2025-12-25T08:00:00.000Z"
  },
  "invite_token": "token"
}
```

Errors:
- `401` if missing/invalid auth
- `403` if role is not `ADMIN`
- `422` if required fields missing
- `409` on validation/limit failures

---

### 3) Resend invite (admin)
`POST /v1/auth/invites/:inviteId/resend`

Response `200`: same shape as create invite.

Errors:
- `401` if missing/invalid auth
- `403` if role is not `ADMIN`
- `409` if invite cannot be resent

---

### 4) Revoke invite (admin)
`POST /v1/auth/invites/:inviteId/revoke`

Response `200`:
```json
{
  "invite": {
    "id": "uuid",
    "tenant_id": "uuid",
    "branch_id": "uuid",
    "role": "CASHIER",
    "phone": "+85598765432",
    "token_hash": "hash",
    "first_name": "Jane",
    "last_name": "Doe",
    "note": null,
    "expires_at": "2025-12-25T08:00:00.000Z",
    "accepted_at": null,
    "revoked_at": "2025-12-23T10:00:00.000Z",
    "created_at": "2025-12-23T08:00:00.000Z"
  }
}
```

Errors:
- `401` if missing/invalid auth
- `403` if role is not `ADMIN`
- `409` if revoke fails

---

### 5) Assign branch (admin)
`POST /v1/auth/users/:userId/assign-branch`

Body:
```json
{
  "branch_id": "uuid",
  "role": "CASHIER"
}
```

Response `201`:
```json
{
  "assignment": {
    "id": "uuid",
    "employee_id": "uuid",
    "branch_id": "uuid",
    "role": "CASHIER",
    "active": true,
    "assigned_at": "2025-12-23T08:00:00.000Z"
  }
}
```

Errors:
- `401` if missing/invalid auth
- `403` if role is not `ADMIN`
- `422` if missing branch_id or role
- `409` on validation/assignment failures

---

### 6) Update role (admin)
`POST /v1/auth/users/:userId/role`

Body:
```json
{
  "branch_id": "uuid",
  "role": "MANAGER"
}
```

Response `200`: same shape as assign-branch.

Errors:
- `401` if missing/invalid auth
- `403` if role is not `ADMIN`
- `422` if missing branch_id or role
- `409` if update fails

---

### 7) Disable employee (admin)
`POST /v1/auth/users/:userId/disable`

Response `200`:
```json
{
  "employee": {
    "id": "uuid",
    "first_name": "John",
    "last_name": "Smith",
    "phone": "+85512345678",
    "status": "DISABLED"
  }
}
```

---

### 8) Reactivate employee (admin)
`POST /v1/auth/users/:userId/reactivate`

Response `200`: same shape as disable.

---

### 9) Archive employee (admin)
`POST /v1/auth/users/:userId/archive`

Response `200`: same shape as disable.

Errors:
- `409` if archive fails (limits, invalid status, etc.)

---

### 10) Get staff shift schedule (admin)
`GET /v1/auth/users/:userId/shifts?branch_id=uuid`

Response `200`:
```json
{
  "schedule": [
    { "day_of_week": 1, "start_time": "10:00", "end_time": "17:00", "is_off": false },
    { "day_of_week": 0, "is_off": true }
  ]
}
```

---

### 11) Set staff shift schedule (admin)
`POST /v1/auth/users/:userId/shifts`

Body:
```json
{
  "branch_id": "uuid",
  "schedule": [
    { "day_of_week": 1, "start_time": "10:00", "end_time": "17:00", "is_off": false },
    { "day_of_week": 2, "start_time": "10:00", "end_time": "17:00", "is_off": false },
    { "day_of_week": 6, "start_time": "13:00", "end_time": "17:00", "is_off": false },
    { "day_of_week": 0, "is_off": true }
  ]
}
```

Errors:
- `422` if schedule entries are invalid
- `409` if assignment fails (frozen branch, not assigned, etc.)
