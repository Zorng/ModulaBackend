# Menu Module

**Responsibility:** Menu items, categories, modifiers, menu↔stock mapping

## Structure

- `api/` - HTTP routes and controllers
- `app/` - Use cases (manage menu items, categories)
- `domain/` - MenuItem, Category entities
- `infra/` - Menu repository
- `migrations/` - Menu-related database tables
- `tests/` - Module tests

## Key Features

- Menu item management
- Categories and modifiers
- Menu to stock item mapping (recipes)
