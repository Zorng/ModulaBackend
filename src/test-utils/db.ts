import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Pool } from "pg";
import type { SeedTenantResult } from "./seed.js";

type AppliedMigration = {
  filename: string;
  checksum: string;
};

function checksumFor(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function readAppliedMigrations(
  pool: Pool
): Promise<Map<string, AppliedMigration>> {
  const result = await pool.query<AppliedMigration>(
    `SELECT filename, checksum FROM schema_migrations`
  );
  return new Map(result.rows.map((row) => [row.filename, row]));
}

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

  await ensureMigrationsTable(pool);
  const appliedByFilename = await readAppliedMigrations(pool);

  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    const checksum = checksumFor(sql);
    const applied = appliedByFilename.get(file);

    if (applied) {
      if (applied.checksum !== checksum) {
        throw new Error(
          `Migration checksum mismatch for "${file}". Do not edit already-applied migrations. Add a new migration instead.`
        );
      }
      continue;
    }

    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query(
        `INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)`,
        [file, checksum]
      );
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
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
  const { seedTenantSingleBranch } = await import("./seed.js");
  return seedTenantSingleBranch(pool);
}
