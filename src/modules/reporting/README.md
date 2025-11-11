# Reporting Module

**Responsibility:** Read models & queries (no business writes)

## Structure

- `api/` - HTTP routes and controllers
- `app/` - Query services
- `domain/` - Read models
- `infra/` - Query repositories (views, materialized views)
- `migrations/` - Reporting views and materialized views
- `tests/` - Module tests

## Key Features

- Sales reports
- Inventory reports
- Cash reports
- Attendance reports
- Event subscribers: build read models from domain events

## Note

**This module does NOT write business data.** It only reads from views/materialized views and builds read models from events.
