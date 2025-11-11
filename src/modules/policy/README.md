# Policy Module

**Responsibility:** Sale/inventory/cash/attendance policies

## Structure

- `api/` - HTTP routes and controllers
- `app/` - Use cases (get policies)
- `domain/` - Policy entities
- `infra/` - Policy repository
- `migrations/` - Policy-related database tables
- `tests/` - Module tests

## Key Features

- VAT/tax policies
- Discount policies
- Inventory policies (allow negative stock)
- Cash policies
- Attendance policies
- Tenant-level configuration
