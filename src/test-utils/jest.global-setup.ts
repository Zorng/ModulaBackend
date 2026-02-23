import { createTestPool, runMigrations } from "./db.js";
import { loadEnvironment } from "../platform/config/env.js";

export default async function globalSetup(): Promise<void> {
  loadEnvironment("test");

  const pool = createTestPool();
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}
