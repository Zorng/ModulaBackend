import fs from "fs";
import path from "path";
import dotenvFlow from "dotenv-flow";
import { Pool } from "pg";

dotenvFlow.config({ node_env: process.env.NODE_ENV || "development" });

async function seedDev() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is required to seed dev data. Add it to .env.local."
    );
  }

  const filePath = path.resolve("migrations", "_seed_dev.sql");
  if (!fs.existsSync(filePath)) {
    console.log("⚠️  No migrations/_seed_dev.sql found; nothing to seed.");
    return;
  }

  const sql = fs.readFileSync(filePath, "utf8");

  const pool = new Pool({ connectionString });
  try {
    console.log("🌱 Seeding dev data...");
    await pool.query(sql);
    console.log("✅ Dev seed completed successfully!");
  } finally {
    await pool.end();
  }
}

// allow: pnpm tsx src/platform/db/seed-dev.ts
if (process.argv[1].includes("seed-dev")) {
  seedDev().catch((err) => {
    console.error("❌ Dev seed failed:", err);
    process.exit(1);
  });
}

export { seedDev };

