# Modula Backend Setup Guide

This guide will help you set up the Modula Backend from scratch, even if you're not familiar with backend development.

## Prerequisites

Before you begin, make sure you have the following installed:

1. **Node.js** (v18 or higher) - [Download here](https://nodejs.org/)
2. **pnpm** - Install with: `npm install -g pnpm`
3. **PostgreSQL** (v14 or higher) - [Download here](https://www.postgresql.org/download/)

## Creating a New Migration

**If you need to add new tables or modify the database structure**, follow these steps:

### Step 1: Create the migrations folder (if it doesn't exist)

```bash
mkdir migrations
```

### Step 2: Create a new SQL file

Just pull the sql script into the directory

or

Create a file in the `migrations/` folder with the next sequential number:

- If the last migration is `001_...`, create `002_...`
- Use a descriptive name: `002_add_inventory_tables.sql`

### Step 3: Write your SQL

```sql
-- migrations/002_add_inventory_tables.sql

CREATE TABLE IF NOT EXISTS inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    quantity INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Step 4: Run the migration

```bash
pnpm migrate
```

That's it! Your new tables are now in the database.

---

## Initial Setup Steps

### Step 1: Install Dependencies

```bash
pnpm install
```

### Step 2: Create Environment File

Copy the example environment file and rename it:

```bash
# On Windows (PowerShell)
copy .env.example .env.local

# On Mac/Linux
cp .env.example .env.local
```

### Step 3: Configure Environment Variables

Open `.env.local` and update the values:

```env
# Replace 'your-password' with your PostgreSQL password
DATABASE_URL=postgres://postgres:your-password@localhost:5432/modula

# Replace with secure random strings (can use any random text for development)
JWT_SECRET=my-dev-secret-key-123
JWT_REFRESH_SECRET=my-dev-refresh-secret-key-456

# Optional: Change port if needed
PORT=3000
NODE_ENV=development
```

### Step 4: Create Database

Make sure PostgreSQL is running, then create the database:

**Using psql command line:**

```bash
psql -U postgres
```

Then in psql:

```sql
CREATE DATABASE modula;
\q
```

**Or use pgAdmin or any PostgreSQL GUI tool** to create a database named `modula`.

### Step 5: Run Migrations

This will create all the necessary tables in your database:

```bash
pnpm migrate
```

### Step 6: Start the Server

```bash
pnpm dev
```

Your backend should now be running at `http://localhost:3000` 🎉

---

## Understanding Migrations

### What are migrations?

Migrations are SQL files that define your database structure (tables, columns, relationships, etc.). They're located in the `migrations/` folder at the root of the project.

### Project Structure

```text
ModulaBackend/
├── migrations/              # ← SQL migration files go here
│   ├── 001_create_auth_tables.sql
│   ├── 002_create_sales_tables.sql
│   └── ...
├── src/
│   ├── modules/
│   ├── platform/
│   └── server.ts
├── .env.example
├── .env.local              # ← Your local config (not in git)
└── package.json
```

### How migrations work

1. **Location**: All SQL files must be in the `migrations/` folder
2. **Naming**: Files are numbered in order (e.g., `001_create_auth_tables.sql`, `002_add_sales_tables.sql`)
3. **Execution**: They run in alphabetical/numerical order when you run `pnpm migrate`
4. **Idempotent**: Use `IF NOT EXISTS` to avoid errors if run multiple times

### Creating a new migration

1. **Create the migrations folder** (if it doesn't exist):

   ```bash
   mkdir migrations
   ```

2. **Create a new SQL file** with the next number in sequence:

   - If the last migration is `001_...`, create `002_...`
   - Use a descriptive name: `002_add_inventory_tables.sql`

3. **Write your SQL statements** in the file:

   ```sql
   -- 002_add_inventory_tables.sql
   CREATE TABLE IF NOT EXISTS inventory (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       name VARCHAR(255) NOT NULL,
       quantity INTEGER DEFAULT 0,
       created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

4. **Run the migration**:

   ```bash
   pnpm migrate
   ```

### Migration best practices

- ✅ **One purpose per migration**: Each migration should do one thing (e.g., create a table, add a column)
- ✅ **Use descriptive names**: `001_create_auth_tables.sql` is better than `001_initial.sql`
- ✅ **Use IF NOT EXISTS**: Prevents errors if accidentally run twice
- ✅ **Test before committing**: Always test migrations on a local database first
- ❌ **Never edit existing migrations**: Once applied, create a new migration to make changes

### Example migration file

```sql
-- migrations/003_add_product_category.sql

-- Add new column to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS category VARCHAR(100);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_products_category 
ON products(category);
```

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm install` | Install all dependencies |
| `pnpm migrate` | Run database migrations |
| `pnpm dev` | Start development server with hot reload |
| `pnpm start` | Start production server |
| `pnpm test` | Run all tests |
| `pnpm test:watch` | Run tests in watch mode |

---

## Troubleshooting

### "Database does not exist" error

Make sure you've created the database:

```bash
psql -U postgres -c "CREATE DATABASE modula;"
```

### "JWT_REFRESH_SECRET is missing" error

Your `.env.local` file is missing the JWT refresh secret. Add it:

```env
JWT_REFRESH_SECRET=any-random-string-here
```

### "Connection refused" or "ECONNREFUSED" error

PostgreSQL is not running. Start it:

- **Windows**: Open Services and start "postgresql-x64-14" (or your version)
- **macOS**: `brew services start postgresql`
- **Linux**: `sudo systemctl start postgresql`

### "No such file or directory: migrations" error

Create the migrations folder:

```bash
mkdir migrations
```

Then add your SQL files to it.

### Migration fails with "relation already exists"

This usually means the migration was partially applied. You can:

1. Drop and recreate the database:

   ```sql
   DROP DATABASE modula;
   CREATE DATABASE modula;
   ```

2. Then run `pnpm migrate` again

### Port already in use

Another application is using port 3000. Change the `PORT` in `.env.local` to something else (e.g., 3001).

---

## Quick Reference

### Where do SQL files go?

Put all `.sql` files in the `migrations/` folder at the root of the project.

### How to name migration files?

Use sequential numbers: `001_description.sql`, `002_description.sql`, etc.

### How to run migrations?

```bash
pnpm migrate
```

### Where to configure database connection?

Edit the `DATABASE_URL` in `.env.local` file.

---

## For Non-Backend Developers

If you're a frontend developer or designer who needs to run the backend locally:

1. **Just follow Steps 1-6 above** - they're simple copy-paste commands
2. **Don't worry about understanding SQL** - the migrations are already written
3. **If something breaks** - check the Troubleshooting section
4. **Need help?** - Ask the backend team

That's it! The backend should now be running and your frontend can connect to it. 🚀
