# Cash Module

**Responsibility:** Cash sessions, movements, X/Z reports

## Structure

- `api/` - HTTP routes and controllers
- `app/` - Use cases (open/close session, cash movements)
- `domain/` - CashSession entity
- `infra/` - Cash repository
- `migrations/` - Cash-related database tables
- `tests/` - Module tests

## Key Features

- Cash session management (open/close)
- Cash movements (paid-in/paid-out)
- X reports (mid-shift)
- Z reports (end of day)
- Event publisher: `cash.session_opened`, `cash.session_closed`
- Event subscriber: accumulate sales into session
