const dotenvFlow = require("dotenv-flow");
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

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

  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    await pool.query(sql);
  }
}

module.exports = async () => {
  dotenvFlow.config({ node_env: process.env.NODE_ENV || "test" });

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
