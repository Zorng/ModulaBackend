# API Documentation with Swagger

This document explains how to use Swagger to test and document the Modula Backend APIs.

## Accessing the Documentation

Once the server is running, you can access the interactive API documentation at:

```text
http://localhost:3000/api-docs
```

The raw OpenAPI specification JSON is available at:

```text
http://localhost:3000/api-docs.json
```

## Using Swagger UI

### For Frontend Developers

The Swagger UI provides a complete interactive documentation for all API endpoints. Here's what you can do:

1. **Browse Endpoints**: All routes are organized by tags (Authentication, Invites, User Management)
2. **View Request/Response Schemas**: Click on any endpoint to see the expected request body and response formats
3. **Test APIs Directly**: Use the "Try it out" button to make actual API calls from your browser

### Testing Authentication Flow

#### 1. Register a New Tenant (Public Endpoint)

```http
POST /v1/auth/register-tenant
```

**Request Body:**

```json
{
  "business_name": "My Restaurant",
  "phone": "+1234567890",
  "first_name": "John",
  "last_name": "Doe",
  "password": "SecurePass123!",
  "business_type": "restaurant"
}
```

**Response:**

```json
{
  "tenant": {
    "id": "uuid",
    "name": "My Restaurant",
    "business_type": "restaurant",
    "status": "active"
  },
  "employee": {
    "id": "uuid",
    "first_name": "John",
    "last_name": "Doe",
    "phone": "+1234567890",
    "status": "ACTIVE"
  },
  "tokens": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### 2. Login (Public Endpoint)

```http
POST /v1/auth/login
```

**Request Body:**

```json
{
  "phone": "+1234567890",
  "password": "SecurePass123!"
}
```

**Response:**

```json
{
  "employee": {
    "id": "uuid",
    "first_name": "John",
    "last_name": "Doe",
    "phone": "+1234567890",
    "status": "ACTIVE"
  },
  "tokens": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "branch_assignments": [
    {
      "id": "uuid",
      "employee_id": "uuid",
      "branch_id": "uuid",
      "branch_name": "Main Branch",
      "role": "ADMIN",
      "active": true
    }
  ]
}
```

#### 3. Authenticate Protected Endpoints

After logging in or registering, you'll receive an `access_token`. To use protected endpoints:

1. Click the **"Authorize"** button at the top of the Swagger UI
2. Enter your token in the format: `Bearer YOUR_ACCESS_TOKEN`
3. Click "Authorize" and then "Close"

All subsequent requests will include this authentication token.

#### 4. Refresh Token (Public Endpoint)

```http
POST /v1/auth/refresh
```

**Request Body:**

```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**

```json
{
  "tokens": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### 5. Logout (Public Endpoint)

```http
POST /v1/auth/logout
```

**Request Body:**

```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Protected Endpoints (Require Authentication)

All endpoints below require:

- **Authorization Header**: `Bearer <access_token>`
- **Admin Role**: Required for invite and user management operations

#### Create Employee Invite (Admin Only)

```http
POST /v1/auth/invites
```

**Request Body:**

```json
{
  "first_name": "Jane",
  "last_name": "Smith",
  "phone": "+1987654321",
  "role": "MANAGER",
  "branch_id": "uuid",
  "note": "New evening shift manager",
  "expires_in_hours": 72
}
```

**Response:**

```json
{
  "invite": {
    "id": "uuid",
    "first_name": "Jane",
    "last_name": "Smith",
    "phone": "+1987654321",
    "role": "MANAGER",
    "branch_id": "uuid",
    "expires_at": "2025-11-20T12:00:00Z"
  },
  "invite_token": "abc123def456..."
}
```

> **Note**: The `invite_token` must be sent to the invitee (e.g., via SMS or email). They will use this token to accept the invitation.

#### Accept Invite (Public Endpoint)

```http
POST /v1/auth/invites/accept/{token}
```

**Request Body:**

```json
{
  "password": "NewPassword123!"
}
```

#### Resend Invite (Admin Only)

```http
POST /v1/auth/invites/{inviteId}/resend
```

#### Revoke Invite (Admin Only)

```http
POST /v1/auth/invites/{inviteId}/revoke
```

#### Assign Branch (Admin Only)

```http
POST /v1/auth/users/{userId}/assign-branch
```

**Request Body:**

```json
{
  "branch_id": "uuid",
  "role": "CASHIER"
}
```

#### Update Role (Admin Only)

```http
POST /v1/auth/users/{userId}/role
```

**Request Body:**

```json
{
  "branch_id": "uuid",
  "role": "MANAGER"
}
```

#### Disable Employee (Admin Only)

```http
POST /v1/auth/users/{userId}/disable
```

## Employee Roles

The system supports four roles with different permission levels:

- **ADMIN**: Full access to all operations including user management
- **MANAGER**: Can manage operations within assigned branches
- **CASHIER**: Can process sales and transactions
- **CLERK**: Basic access for inventory and reporting

## Employee Status

- **ACTIVE**: Employee can log in and perform operations
- **INVITED**: Employee has been invited but hasn't accepted yet
- **DISABLED**: Employee account is deactivated

## Error Responses

All endpoints follow a consistent error response format:

```json
{
  "error": "Error message describing what went wrong"
}
```

Common HTTP status codes:

- **200**: Success
- **201**: Resource created successfully
- **400**: Bad request / Logout failed
- **401**: Authentication required / Invalid credentials
- **403**: Insufficient permissions
- **409**: Conflict (e.g., duplicate phone number)
- **422**: Validation error (missing required fields)

## Token Management

### Access Token

- **Purpose**: Authenticate API requests
- **Location**: Authorization header as `Bearer <token>`
- **Expiry**: Short-lived (configurable, typically 15-60 minutes)
- **Usage**: Include in every protected endpoint request

### Refresh Token

- **Purpose**: Obtain new access/refresh token pairs
- **Location**: Request body for `/refresh` and `/logout` endpoints
- **Expiry**: Long-lived (configurable, typically days/weeks)
- **Storage**: Store securely on the client (e.g., secure HTTP-only cookie or encrypted storage)

### Best Practices

1. Store tokens securely on the frontend
2. Use the refresh token to get new access tokens before they expire
3. Implement automatic token refresh in your HTTP client
4. Clear tokens on logout
5. Handle 401 responses by refreshing the token or redirecting to login

## Frontend Integration Example

Here's a typical authentication flow for frontend developers:

```javascript
// 1. Login
const loginResponse = await fetch('http://localhost:3000/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    phone: '+1234567890',
    password: 'password123'
  })
});

const { tokens, employee, branch_assignments } = await loginResponse.json();

// 2. Store tokens securely
localStorage.setItem('access_token', tokens.access_token);
localStorage.setItem('refresh_token', tokens.refresh_token);

// 3. Make authenticated requests
const response = await fetch('http://localhost:3000/v1/auth/invites', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
  },
  body: JSON.stringify({
    first_name: 'Jane',
    last_name: 'Smith',
    phone: '+1987654321',
    role: 'MANAGER',
    branch_id: 'branch-uuid'
  })
});

// 4. Handle token expiration
if (response.status === 401) {
  // Refresh the token
  const refreshResponse = await fetch('http://localhost:3000/v1/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refresh_token: localStorage.getItem('refresh_token')
    })
  });
  
  const { tokens: newTokens } = await refreshResponse.json();
  localStorage.setItem('access_token', newTokens.access_token);
  localStorage.setItem('refresh_token', newTokens.refresh_token);
  
  // Retry the original request
}

// 5. Logout
await fetch('http://localhost:3000/v1/auth/logout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    refresh_token: localStorage.getItem('refresh_token')
  })
});

localStorage.removeItem('access_token');
localStorage.removeItem('refresh_token');
```

## Testing with cURL

If you prefer command-line testing, here are some cURL examples:

```bash
# Register tenant
curl -X POST http://localhost:3000/v1/auth/register-tenant \
  -H "Content-Type: application/json" \
  -d '{
    "business_name": "My Business",
    "phone": "+1234567890",
    "first_name": "John",
    "last_name": "Doe",
    "password": "SecurePass123!"
  }'

# Login
curl -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+1234567890",
    "password": "SecurePass123!"
  }'

# Create invite (replace YOUR_TOKEN with actual access token)
curl -X POST http://localhost:3000/v1/auth/invites \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "first_name": "Jane",
    "last_name": "Smith",
    "phone": "+1987654321",
    "role": "MANAGER",
    "branch_id": "branch-uuid"
  }'
```

## Additional Resources

- **OpenAPI Specification**: [swagger.config.ts](../platform/config/swagger.config.ts)
- **Auth Router**: [auth.router.ts](auth.router.ts)
- **Auth Controller**: [controllers/auth.controller.ts](controllers/auth.controller.ts)
- **Domain Entities**: [../domain/entities.ts](../domain/entities.ts)

## Development Notes

### Adding New Endpoints

To document new endpoints in Swagger:

1. Add JSDoc comments above the route definition in the router
2. Use `@openapi` tag followed by OpenAPI YAML specification
3. Reference existing schemas from `swagger.config.ts` using `$ref`
4. Include all possible response codes with descriptions

Example:

```typescript
/**
 * @openapi
 * /v1/auth/my-endpoint:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Brief description
 *     description: Detailed description
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MyRequestSchema'
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MyResponseSchema'
 */
router.post('/my-endpoint', controller.myHandler);
```

### Adding New Schemas

Add new schemas to the `components.schemas` section in `swagger.config.ts`:

```typescript
MyNewSchema: {
  type: 'object',
  required: ['field1', 'field2'],
  properties: {
    field1: {
      type: 'string',
      description: 'Field description'
    },
    field2: {
      type: 'number',
      description: 'Another field'
    }
  }
}
```

## Support

For questions or issues with the API:

- Check the Swagger UI interactive documentation
- Review this README
- Contact the backend team
