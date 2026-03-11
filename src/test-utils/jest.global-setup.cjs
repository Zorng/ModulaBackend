const dotenv = require("dotenv");
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function checksumFor(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

async function ensureMigrationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function readAppliedMigrations(pool) {
  const result = await pool.query(
    `SELECT filename, checksum FROM schema_migrations`
  );
  return new Map(result.rows.map((row) => [row.filename, row]));
}

async function runMigrations(pool) {
  const dir = path.resolve(process.cwd(), "migrations");
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

function loadEnvironment(defaultNodeEnv = "test") {
  const nodeEnv = String(process.env.NODE_ENV || "").trim() || defaultNodeEnv;
  const appEnv = normalizeAppEnv(process.env.APP_ENV, nodeEnv);
  process.env.NODE_ENV = nodeEnv;
  process.env.APP_ENV = appEnv;
  const lockedKeys = new Set(Object.keys(process.env));

  const baseFiles = [".env", `.env.${nodeEnv}`];
  for (const fileName of baseFiles) {
    const filePath = path.resolve(process.cwd(), fileName);
    applyEnvFile(filePath, lockedKeys);
  }

  const legacyLocal = ".env.local";
  const legacyLocalPath = path.resolve(process.cwd(), legacyLocal);
  if (fs.existsSync(legacyLocalPath)) {
    throw new Error(
      `[env] "${legacyLocal}" is no longer supported. Move values into "${expectedLocalEnvFilename(nodeEnv, appEnv)}" and remove "${legacyLocal}".`
    );
  }

  for (const fileName of resolveScopedEnvFiles(nodeEnv, appEnv)) {
    const filePath = path.resolve(process.cwd(), fileName);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    applyEnvFile(filePath, lockedKeys);
  }
}

function normalizeAppEnv(rawAppEnv, nodeEnv) {
  const normalized = String(rawAppEnv || "").trim().toLowerCase();
  if (normalized.length > 0) {
    return normalized;
  }
  if (nodeEnv === "test") {
    return "test";
  }
  if (nodeEnv === "production") {
    return "production";
  }
  return "local";
}

function resolveScopedEnvFiles(nodeEnv, appEnv) {
  if (appEnv === "local" || appEnv === nodeEnv) {
    return [`.env.${nodeEnv}.local`];
  }

  return [
    `.env.${nodeEnv}.${appEnv}`,
    `.env.${nodeEnv}.${appEnv}.local`,
  ];
}

function expectedLocalEnvFilename(nodeEnv, appEnv) {
  if (appEnv === "local" || appEnv === nodeEnv) {
    return `.env.${nodeEnv}.local`;
  }
  return `.env.${nodeEnv}.${appEnv}.local`;
}

function applyEnvFile(filePath, lockedKeys) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const parsed = dotenv.parse(fs.readFileSync(filePath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (lockedKeys.has(key)) {
      continue;
    }
    process.env[key] = value;
  }
}

module.exports = async () => {
  loadEnvironment("test");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for integration tests");
  }

  // Safety check: this setup drops the `public` schema to guarantee a clean DB.
  // Refuse to run if the database name doesn't look like a test database.
  try {
    const dbName = new URL(connectionString).pathname.replace(/^\//, "");
    if (!/test/i.test(dbName)) {
      throw new Error(
        `Refusing to reset schema for non-test database: "${dbName}". Ensure DATABASE_URL points to a test DB (e.g., modula_test).`
      );
    }
  } catch (err) {
    throw err instanceof Error
      ? err
      : new Error("Invalid DATABASE_URL; cannot verify test DB safety.");
  }

  const pool = new Pool({ connectionString });
  try {
    // Ensure the test database starts clean and deterministic for integration tests.
    await pool.query(`DROP SCHEMA IF EXISTS public CASCADE`);
    await pool.query(`CREATE SCHEMA public`);

    await runMigrations(pool);
  } finally {
    await pool.end();
  }
};
