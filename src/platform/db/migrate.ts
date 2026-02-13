import fs from "fs";
import path from "path";
import crypto from "crypto";
import { pool } from "#db";

type AppliedMigration = {
  filename: string;
  checksum: string;
};

function listMigrationFiles(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && !f.startsWith("_"))
    .sort();
}

function checksumFor(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function readAppliedMigrations(): Promise<Map<string, AppliedMigration>> {
  const result = await pool.query<AppliedMigration>(
    `SELECT filename, checksum FROM schema_migrations`
  );
  return new Map(result.rows.map((row) => [row.filename, row]));
}

export async function migrate() {
  const dir = path.resolve("migrations");

  // Create migrations directory if it doesn't exist
  if (!fs.existsSync(dir)) {
    console.log("⚠️  Migrations directory not found. Creating it...");
    fs.mkdirSync(dir, { recursive: true });
    console.log("✅ Created migrations/ directory");
    console.log(
      "📝 Place your SQL migration files there (e.g., 001_create_tables.sql)"
    );
    return;
  }

  const files = listMigrationFiles(dir);

  if (files.length === 0) {
    console.log("⚠️  No migration files found in migrations/ directory");
    console.log("📝 Add SQL files like: 001_create_tables.sql, 002_add_users.sql");
    return;
  }

  await ensureMigrationsTable();
  const appliedByFilename = await readAppliedMigrations();

  console.log("🚀 Applying pending migrations...");
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
      console.log(`↷ ${file} already applied`);
      continue;
    }

    try {
      console.log("→", file);
      await pool.query("BEGIN");
      await pool.query(sql);
      await pool.query(
        `INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)`,
        [file, checksum]
      );
      await pool.query("COMMIT");
      console.log(`✅ ${file} completed successfully`);
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error(`❌ Failed to apply migration: ${file}`);
      console.error(`Error details:`, error);
      throw error;
    }
  }

  console.log("✅ Migration sync completed");
  await pool.end();
}

// allow: pnpm tsx src/platform/db/migrate.ts
if (process.argv[1].includes("migrate")) {
  migrate().catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  });
}
