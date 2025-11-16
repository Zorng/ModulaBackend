# Modula Backend

## How to set up

1. Create a database in Postgres

   `CREATE DATABASE "modula";`

2. Make a `.env.local` out of `.env.example`. In the field `DATABASE_URL` replace _your-password_ with your postgres user password
3. Migrate database with command `pnpm tsx src/platform/migrate.ts`

Test run with command `pnpm dev`
