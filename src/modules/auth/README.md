# Auth Module

**Responsibility:** Users, roles, sessions, capabilities

## Structure

- `api/` - HTTP routes and controllers
- `app/` - Use cases (login, register, refresh token, etc.)
- `domain/` - User entity, role policies
- `infra/` - User repository, JWT service
- `migrations/` - Auth-related database tables
- `tests/` - Module tests

## Key Features

- User authentication (login/logout)
- JWT token generation and validation
- Role-based access control (RBAC)
- Capabilities and feature flags
