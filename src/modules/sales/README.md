# Sales Module

**Responsibility:** Orders/carts, checkout, tenders, rounding, status

## Structure

- `api/` - HTTP routes and controllers
- `app/` - Use cases (create order, finalize sale)
- `domain/` - Sale, OrderLine entities
- `infra/` - Sales repository
- `migrations/` - Sales-related database tables
- `tests/` - Module tests

## Key Features

- Order/cart management
- Pre-checkout calculations
- Multiple tender methods (CASH, QR)
- Currency rounding (USD/KHR)
- Sale finalization
- Event publisher: `sales.sale_finalized`
