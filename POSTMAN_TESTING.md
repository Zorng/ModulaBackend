# Postman Testing Guide - Auth Module

## Prerequisites

1. **Start the server**: `pnpm run dev`
2. **Server URL**: `http://localhost:3000`
3. **Ensure migrations are run**: `pnpm run migrate`

---

## Test Accounts Available

The database has been seeded with test accounts:

| Role | Phone | Email | Password |
|------|-------|-------|----------|
| Admin | `+1234567890` | `admin@test.com` | `Test123!` |
| Manager | `+1234567891` | `manager@test.com` | `Test123!` |
| Cashier | `+1234567892` | `cashier@test.com` | `Test123!` |
| Clerk | `+1234567893` | `clerk@test.com` | `Test123!` |

**Tenant**: Test Restaurant
**Branches**: Main Branch, Downtown Branch

---

## 1. Register Tenant (Create First Admin User)

**POST** `http://localhost:3000/v1/auth/register-tenant`

**Headers:**

```http
Content-Type: application/json
```

**Body (raw JSON):**

```json
{
  "business_name": "My Coffee Shop",
  "phone": "+9876543210",
  "first_name": "John",
  "last_name": "Doe",
  "password": "SecurePass123!",
  "business_type": "RETAIL"
}
```

**Expected Response (201 Created):**

```json
{
  "tenant": {
    "id": "uuid-here",
    "name": "My Coffee Shop",
    "business_type": "RETAIL",
    "status": "ACTIVE"
  },
  "employee": {
    "id": "uuid-here",
    "first_name": "John",
    "last_name": "Doe",
    "phone": "+1234567890",
    "status": "ACTIVE"
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "long-hex-string...",
    "expiresIn": 43200
  }
}
```

### Save the access token for protected routes

Example token:

```text
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbXBsb3llZUlkIjoiNTEwNmJhM2UtY2NiYS00M2EyLTlkN2YtYjRkNzkzNGU2NjZlIiwidGVuYW50SWQiOiJlYWM2NjJlYy0yMTIwLTQ2NjMtOWNjOS1lMmYwZjM0NWNhNGUiLCJicmFuY2hJZCI6IjhhZmRiMWRkLWE0NjQtNDdhOS1iM2VhLWI0MWMxOWEyMGVmNCIsInJvbGUiOiJBRE1JTiIsImlhdCI6MTc2MzIwNDM4NSwiZXhwIjoxNzYzMjQ3NTg1LCJpc3MiOiJtb2R1bGEtYXV0aCJ9.example
```

---

## 2. Login

**POST** `http://localhost:3000/v1/auth/login`

**Headers:**

```http
Content-Type: application/json
```

**Body (raw JSON):**

```json
{
  "phone": "+1234567890",
  "password": "Test123!"
}
```

**Or use any test account from the table above:**

```json
{
  "phone": "+1234567891",
  "password": "Test123!"
}
```

**Expected Response (200 OK):**

```json
{
  "employee": {
    "id": "uuid-here",
    "first_name": "John",
    "last_name": "Doe",
    "phone": "+1234567890",
    "status": "ACTIVE"
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "long-hex-string...",
    "expiresIn": 43200
  },
  "branch_assignments": [
    {
      "id": "uuid-here",
      "employee_id": "uuid-here",
      "branch_id": "uuid-here",
      "role": "ADMIN",
      "active": true,
      "assigned_at": "2025-11-15T..."
    }
  ]
}
```

**Save the `accessToken` and `branch_id` for the next steps!**

8afdb1dd-a464-47a9-b3ea-b41c19a20ef4

---

## 3. Create Invite (Admin Only)

**POST** `http://localhost:3000/v1/auth/invites`

**Headers:**

```http
Content-Type: application/json
Authorization: Bearer YOUR_ACCESS_TOKEN_HERE
```

**Body (raw JSON):**

```json
{
  "first_name": "Jane",
  "last_name": "Smith",
  "phone": "+1234567899",
  "role": "CASHIER",
  "branch_id": "BRANCH_ID_FROM_LOGIN_RESPONSE",
  "note": "New cashier for morning shift",
  "expires_in_hours": 72
}
```

**Expected Response (201 Created):**

```json
{
  "invite": {
    "id": "uuid-here",
    "first_name": "Jane",
    "last_name": "Smith",
    "phone": "+9876543210",
    "role": "CASHIER",
    "branch_id": "uuid-here",
    "expires_at": "2025-11-18T..."
  },
  "invite_token": "long-hex-token-string"
}
```

**Save the `invite_token` - the invited user needs this to accept!**

---

## 4. Accept Invite

**POST** `http://localhost:3000/v1/auth/invites/accept/INVITE_TOKEN_HERE`

Replace `INVITE_TOKEN_HERE` with the actual token from step 3.

**Headers:**

```http
Content-Type: application/json
```

**Body (raw JSON):**

```json
{
  "password": "JanesSecurePass123!"
}
```

**Expected Response (200 OK):**

```json
{
  "employee": {
    "id": "uuid-here",
    "first_name": "Jane",
    "last_name": "Smith",
    "phone": "+9876543210",
    "status": "ACTIVE"
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "long-hex-string...",
    "expiresIn": 43200
  }
}
```

The invited employee is now registered and can login!

---

## 5. Refresh Token

**POST** `http://localhost:3000/v1/auth/refresh`

**Headers:**

```http
Content-Type: application/json
```

**Body (raw JSON):**

```json
{
  "refresh_token": "REFRESH_TOKEN_FROM_LOGIN"
}
```

**Expected Response (200 OK):**

```json
{
  "tokens": {
    "accessToken": "NEW_ACCESS_TOKEN",
    "refreshToken": "NEW_REFRESH_TOKEN",
    "expiresIn": 43200
  }
}
```

---

## 6. Logout

**POST** `http://localhost:3000/v1/auth/logout`

**Headers:**

```http
Content-Type: application/json
```

**Body (raw JSON):**

```json
{
  "refresh_token": "REFRESH_TOKEN_TO_REVOKE"
}
```

**Expected Response (200 OK):**

```json
{
  "message": "Logged out successfully"
}
```

---

## 7. Revoke Invite (Admin Only)

**POST** `http://localhost:3000/v1/auth/invites/INVITE_ID/revoke`

Replace `INVITE_ID` with the actual invite ID.

**Headers:**

```http
Content-Type: application/json
Authorization: Bearer YOUR_ACCESS_TOKEN_HERE
```

**Expected Response (200 OK):**

```json
{
  "invite": {
    "id": "uuid-here",
    "revoked_at": "2025-11-15T..."
  }
}
```

---

## Error Responses

### 401 Unauthorized

```json
{
  "error": "Missing or invalid authorization header"
}
```

### 403 Forbidden

```json
{
  "error": "Insufficient permissions for this action"
}
```

### 409 Conflict

```json
{
  "error": "Failed to register tenant: Employee already exists"
}
```

### 422 Unprocessable Entity

```json
{
  "error": "All fields are required"
}
```

---

## Testing Flow

### Complete Registration & Invite Flow

1. **Register Tenant** → Get access token
2. **Login** → Verify login works, get branch_id
3. **Create Invite** → Get invite token
4. **Accept Invite** → New employee gets access
5. **Login as New Employee** → Verify invited employee can login
6. **Refresh Token** → Verify token refresh works
7. **Logout** → Clean up session

---

## Postman Tips

### 1. Environment Variables

Create a Postman environment with:

- `baseUrl`: `http://localhost:3000`
- `accessToken`: (auto-set after login)
- `refreshToken`: (auto-set after login)
- `branchId`: (auto-set after login)

### 2. Auto-Save Tokens

In the **Tests** tab for login/register requests:

```javascript
const response = pm.response.json();
pm.environment.set("accessToken", response.tokens.accessToken);
pm.environment.set("refreshToken", response.tokens.refreshToken);
if (response.branch_assignments && response.branch_assignments[0]) {
    pm.environment.set("branchId", response.branch_assignments[0].branch_id);
}
```

### 3. Use Variables in Headers

Authorization header:

```http
Bearer {{accessToken}}
```

### 4. Use Variables in URLs

```http
{{baseUrl}}/v1/auth/invites/accept/{{inviteToken}}
```

---

## Common Issues

### "Invalid credentials"

- Check phone number format (include country code)
- Verify password is correct
- Ensure employee status is ACTIVE

### "Missing or invalid authorization header"

- Ensure Authorization header is set: `Bearer <token>`
- Check token hasn't expired (12 hours)
- Token should not have extra spaces

### "Insufficient permissions"

- Only ADMIN employees can create/revoke invites
- Check employee's role in branch_assignments

### "Invalid invite token"

- Token may have expired (72 hours default)
- Token may have been revoked
- Token may have already been accepted
