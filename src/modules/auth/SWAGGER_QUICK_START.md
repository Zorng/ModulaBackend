# Swagger API Testing Quick Reference

## Quick Start

1. **Start the server**:

   ```bash
   pnpm dev
   ```

2. **Open Swagger UI**:

   ```text
   http://localhost:3000/api-docs
   ```

3. **Test the API**:
   - Click on any endpoint to expand it
   - Click "Try it out" button
   - Fill in the required parameters
   - Click "Execute" to make the request

## Authentication Quick Test

### Step 1: Register a Tenant (No Auth Required)

**Endpoint**: `POST /v1/auth/register-tenant`

**Body**:

```json
{
  "business_name": "Test Restaurant",
  "phone": "+1234567890",
  "first_name": "John",
  "last_name": "Doe",
  "password": "Test123!@#"
}
```

**Copy from response**: `tokens.access_token`

### Step 2: Authorize in Swagger

1. Click the **🔓 Authorize** button at the top
2. Enter: `Bearer YOUR_ACCESS_TOKEN_HERE`
3. Click **Authorize**, then **Close**

### Step 3: Test Protected Endpoints

Now you can test any protected endpoint (marked with a 🔒 lock icon).

**Example - Create Invite**: `POST /v1/auth/invites`

```json
{
  "first_name": "Jane",
  "last_name": "Smith",
  "phone": "+1987654321",
  "role": "MANAGER",
  "branch_id": "get-from-register-response-or-db"
}
```

## Common Test Scenarios

### Scenario 1: New Tenant Registration & Login

1. Register tenant → Get tokens
2. Use access_token for authenticated requests
3. Use refresh_token when access_token expires

### Scenario 2: Invite & Accept Flow

1. Admin creates invite → Gets invite_token
2. Send invite_token to new employee
3. New employee accepts invite with token → Gets their own tokens
4. New employee can now login with their phone/password

### Scenario 3: User Management

1. Admin assigns employee to branch
2. Admin updates employee role
3. Admin disables employee if needed

## Endpoint Categories

### 🌐 Public Endpoints (No Auth)

- `POST /v1/auth/register-tenant`
- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`
- `POST /v1/auth/invites/accept/{token}`

### 🔒 Admin-Only Endpoints (Requires Auth + ADMIN Role)

- `POST /v1/auth/invites` - Create invite
- `POST /v1/auth/invites/{inviteId}/resend`
- `POST /v1/auth/invites/{inviteId}/revoke`
- `POST /v1/auth/users/{userId}/assign-branch`
- `POST /v1/auth/users/{userId}/role`
- `POST /v1/auth/users/{userId}/disable`

## Response Status Codes

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 200 | Success | Request completed successfully |
| 201 | Created | Resource created (tenant, invite, assignment) |
| 401 | Unauthorized | Missing/invalid token, wrong password |
| 403 | Forbidden | Not enough permissions (need ADMIN role) |
| 409 | Conflict | Duplicate phone number, already accepted invite |
| 422 | Validation Error | Missing required fields |

## Troubleshooting

### "401 Unauthorized" Error

- Check if you clicked the Authorize button
- Verify your token format: `Bearer <token>` (with space)
- Your access token may have expired - use refresh token

### "403 Forbidden" Error

- Endpoint requires ADMIN role
- Login with an admin account (tenant owner)

### "422 Validation Error"

- Check all required fields are filled
- Verify field names match exactly (case-sensitive)

### "409 Conflict" Error

- Phone number already registered
- Invite already accepted
- Try with different data

## Tips for Frontend Developers

1. **Export OpenAPI Spec**:
   - Visit `http://localhost:3000/api-docs.json`
   - Use with code generators (openapi-generator, swagger-codegen)

2. **Generate TypeScript Client**:

    ```bash
   npx openapi-typescript http://localhost:3000/api-docs.json --output ./types/api.ts
   ```

3. **Test in Postman**:
   - Import from URL: `http://localhost:3000/api-docs.json`

4. **View Raw Responses**:
   - Check the "Response" section after executing requests
   - Copy cURL commands using the "Copy cURL" button

## Additional Features

- **Dark/Light Mode**: Toggle in Swagger UI
- **Copy as cURL**: Each request can be copied as a cURL command
- **Model Examples**: Click on schemas to see example values
- **Download Spec**: Download the OpenAPI JSON specification

## Need Help?

- See full documentation: [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)
- Check auth module README: [README.md](./README.md)
- Review test files: [tests/](./tests/)
