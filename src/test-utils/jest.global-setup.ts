import dotenvFlow from "dotenv-flow";
import { createTestPool, runMigrations } from "./db.js";

export default async function globalSetup(): Promise<void> {
  dotenvFlow.config({ node_env: process.env.NODE_ENV || "test" });

  const pool = createTestPool();
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}

