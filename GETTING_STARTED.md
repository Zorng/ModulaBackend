# 🚀 Modula Backend - Complete Setup Guide

**Everything you need to set up and run the Modula Backend - in one place!**

---

## 📋 Table of Contents

- [Quick Setup (3 Commands)](#quick-setup-3-commands)
- [Prerequisites](#prerequisites)
- [First Time Setup](#first-time-setup)
- [Adding Database Migrations](#adding-database-migrations)
- [Daily Commands](#daily-commands)
- [Troubleshooting](#troubleshooting)
- [Examples](#examples)
- [Best Practices](#best-practices)

---

## Quick Setup (3 Commands)

```bash
pnpm install    # Install dependencies
pnpm setup      # Run setup wizard
pnpm dev        # Start server
```

✅ **Done!** Your backend is running at <http://localhost:3000>

---

## Prerequisites

Before you begin, install these:

- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **pnpm** - Install with: `npm install -g pnpm`
- **PostgreSQL** (v14 or higher) - [Download](https://www.postgresql.org/download/)

---

## First Time Setup

### Automated Setup (Recommended)

The setup wizard will guide you through everything:

```bash
# 1. Install dependencies
pnpm install

# 2. Run the setup wizard
pnpm setup
```

The wizard will ask you:

- Your PostgreSQL password (usually `postgres`)
- Database name (press Enter to use `modula`)
- Port (press Enter to use `5432`)

It will automatically:

- ✅ Create your `.env.local` configuration file
- ✅ Create the PostgreSQL database
- ✅ Run all migrations
- ✅ Set up JWT secrets

Then start the server:

```bash
pnpm dev
```

### Manual Setup (Alternative)

If you prefer to set up manually:

1. **Create database:**

   ```sql
   CREATE DATABASE modula;
   ```

2. **Copy environment file:**

   ```bash
   cp .env.example .env.local
   ```

3. **Edit `.env.local`:**

   ```env
   DATABASE_URL=postgres://postgres:your-password@localhost:5432/modula
   JWT_SECRET=your-secret-key
   JWT_REFRESH_SECRET=your-refresh-secret-key
   PORT=3000
   NODE_ENV=development
   ```

4. **Run migrations:**

   ```bash
   pnpm migrate
   ```

5. **Start the server:**

   ```bash
   pnpm dev
   ```

---

## Adding Database Migrations

### Where to Put SQL Files?

Place all migration files in the **`migrations/`** folder at the project root:

```text
ModulaBackend/
├── migrations/           ← Put your SQL files here!
│   ├── 001_create_auth_tables.sql
│   ├── 002_add_inventory_tables.sql
│   └── 003_your_new_migration.sql
├── src/
├── package.json
└── ...
```

### How to Name Migration Files?

Use sequential numbers with descriptive names:

**Format:** `{number}_{description}.sql`

Examples:

- ✅ `001_create_auth_tables.sql`
- ✅ `002_add_inventory_tables.sql`
- ✅ `003_add_products_table.sql`
- ❌ `new_migration.sql` (missing number)
- ❌ `2_update.sql` (should be 002)

### Creating a New Migration

**Step 1:** Create your SQL file with the next sequential number

```bash
# Windows PowerShell
New-Item migrations/003_add_products.sql

# Mac/Linux or Git Bash
touch migrations/003_add_products.sql
```

**Step 2:** Write your SQL

```sql
-- migrations/003_add_products.sql

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    stock INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX idx_products_name ON products(name);

-- Add comments for documentation
COMMENT ON TABLE products IS 'Stores product information';
```

**Step 3:** Run the migration

```bash
pnpm migrate
```

You'll see output like:

```text
🚀 Applying migrations...
→ 001_create_auth_tables.sql
→ 002_add_inventory_tables.sql
→ 003_add_products.sql
✅ All migrations applied successfully!
```

---

## Daily Commands

```bash
pnpm dev           # Start development server with auto-reload
pnpm migrate       # Run new database migrations
pnpm test          # Run all tests
pnpm test:watch    # Run tests in watch mode
pnpm start         # Start production server
```

---

## Troubleshooting

### "PostgreSQL is not running"

**Windows:**

1. Open Services (Win + R → `services.msc`)
2. Find "PostgreSQL" and click Start

**Mac:**

```bash
brew services start postgresql
```

**Linux:**

```bash
sudo systemctl start postgresql
```

### "Password authentication failed"

When you run `pnpm setup`, enter the correct PostgreSQL password.

Or manually edit `.env.local`:

```env
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/modula
```

### "Database already exists"

The setup wizard will ask if you want to recreate it. Say yes for a fresh start, or:

```bash
# Manually drop and recreate
psql -U postgres -c "DROP DATABASE modula;"
psql -U postgres -c "CREATE DATABASE modula;"
pnpm migrate
```

### "Command not found: pnpm"

Install pnpm first:

```bash
npm install -g pnpm
```

### "migrations directory not found"

Create the folder:

```bash
mkdir migrations
```

The `pnpm migrate` command will now auto-create this folder if it doesn't exist.

### "relation already exists"

Your table is already created. Either:

1. Use `IF NOT EXISTS` in your SQL
2. Drop and recreate the database
3. Skip that specific migration

### Migration runs but nothing happens

Check:

1. Are you connected to the right database?
2. Did the SQL have any syntax errors?
3. Check the terminal output for error messages

---

## Examples

### Example 1: Adding a Table

**File:** `migrations/004_add_orders_table.sql`

```sql
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
```

### Example 2: Adding a Column

**File:** `migrations/005_add_phone_to_users.sql`

```sql
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

COMMENT ON COLUMN users.phone IS 'User phone number (optional)';
```

### Example 3: Creating an Enum Type

**File:** `migrations/006_add_user_role_enum.sql`

```sql
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'manager', 'staff', 'customer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS role user_role DEFAULT 'customer';
```

---

## Best Practices

### 1. Use Descriptive Names

Future you will thank you!

- ✅ `003_add_user_email_verification.sql`
- ❌ `003_update.sql`

### 2. Use IF NOT EXISTS

Prevents errors if the table already exists:

```sql
CREATE TABLE IF NOT EXISTS users (...);
```

### 3. Add Comments

Document your schema for others:

```sql
COMMENT ON TABLE users IS 'Stores user account information';
COMMENT ON COLUMN users.email IS 'User email address, must be unique';
```

### 4. One Migration Per Feature

Don't mix unrelated changes:

- ✅ `003_add_products_table.sql` (just products)
- ❌ `003_add_products_and_orders_and_fix_users.sql` (too much)

### 5. Test Locally First

Always run migrations on your local database before committing to version control.

### 6. Never Modify Existing Migrations

Once a migration has been run in production, never modify it. Create a new migration instead.

---

## Quick Reference Card

**Print this section and keep it at your desk!**

### Setup

```bash
pnpm install
pnpm setup
pnpm dev
```

### Adding Migrations

1. Create file: `migrations/00X_description.sql`
2. Write SQL with `IF NOT EXISTS`
3. Run: `pnpm migrate`

### Common Issues

| Issue | Fix |
|-------|-----|
| PostgreSQL not running | Services → Start PostgreSQL |
| Wrong password | Edit `.env.local` |
| Fresh database needed | `pnpm setup` (say yes to recreate) |
| pnpm not found | `npm install -g pnpm` |

---

## Project Structure

```text
src/
├── modules/           # Feature modules (auth, sales, inventory, etc.)
│   └── [module]/
│       ├── api/       # HTTP routes and controllers
│       ├── app/       # Business logic (use cases, services)
│       ├── domain/    # Domain entities and business rules
│       ├── infra/     # Database repositories
│       └── tests/     # Module tests
├── platform/          # Core infrastructure
│   ├── config/        # Configuration
│   ├── db/            # Database connection and migrations
│   ├── events/        # Event system
│   └── logger/        # Logging
└── shared/            # Shared utilities
    ├── errors.ts      # Error types
    ├── result.ts      # Result type for error handling
    └── ...
```

---

## Setup Checklist

Use this checklist for first-time setup:

- [ ] Node.js installed (v18+)
- [ ] pnpm installed (`npm install -g pnpm`)
- [ ] PostgreSQL installed and running
- [ ] Clone the repository
- [ ] Run `pnpm install`
- [ ] Run `pnpm setup`
- [ ] Run `pnpm dev`
- [ ] Access <http://localhost:3000>

✅ **You're ready to develop!**

---

## Additional Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Express.js Documentation](https://expressjs.com/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)

---

## Need Help?

1. Check the terminal output for error messages
2. Review this guide's troubleshooting section
3. Check existing migration files for examples
4. Ask your team members
5. Review the project's `ARCHITECTURE.md` for system design

---

**Last updated:** November 2025

**Remember:** Migrations are permanent changes to your database structure. Always review your SQL before running migrations!
