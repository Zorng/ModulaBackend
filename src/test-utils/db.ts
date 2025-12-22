import fs from "fs";
import path from "path";
import { Pool } from "pg";
import type { SeedTenantResult } from "./seed.js";
import { seedTenantSingleBranch } from "./seed.js";

export function createTestPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for integration tests");
  }
  return new Pool({ connectionString });
}

export async function runMigrations(pool: Pool): Promise<void> {
  const dir = path.resolve("migrations");
  if (!fs.existsSync(dir)) {
    throw new Error("migrations/ directory not found");
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && !f.startsWith("_"))
    .sort();

  if (files.length === 0) {
    throw new Error("No migration files found in migrations/");
  }

  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    await pool.query(sql);
  }
}

export async function truncateAll(
  pool: Pool,
  options?: { except?: string[] }
): Promise<void> {
  const result = await pool.query(
    `SELECT tablename
     FROM pg_tables
     WHERE schemaname = 'public'`
  );

  const excluded = new Set(options?.except ?? []);
  const tables = result.rows
    .map((row: any) => row.tablename as string)
    .filter((name) => !excluded.has(name));

  if (tables.length === 0) {
    return;
  }

  const quoted = tables.map((name) => `"${name.replace(/"/g, '""')}"`);
  await pool.query(`TRUNCATE ${quoted.join(", ")} RESTART IDENTITY CASCADE`);
}

export async function seedBase(pool: Pool): Promise<SeedTenantResult> {
  return seedTenantSingleBranch(pool);
}
