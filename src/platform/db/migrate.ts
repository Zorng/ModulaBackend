import fs from "fs";
import path from "path";
import { pool } from "#db";

export async function migrate() {
    const dir = path.resolve("migrations");
    
    // Create migrations directory if it doesn't exist
    if (!fs.existsSync(dir)) {
        console.log("⚠️  Migrations directory not found. Creating it...");
        fs.mkdirSync(dir, { recursive: true });
        console.log("✅ Created migrations/ directory");
        console.log("📝 Place your SQL migration files there (e.g., 001_create_tables.sql)");
        return;
    }

    const files = fs.readdirSync(dir)
        .filter(f => f.endsWith(".sql") && !f.startsWith("_"))
        .sort();

    if (files.length === 0) {
        console.log("⚠️  No migration files found in migrations/ directory");
        console.log("📝 Add SQL files like: 001_create_tables.sql, 002_add_users.sql");
        return;
    }

    console.log("🚀 Applying migrations...");
    for (const file of files) {
        try {
            const sql = fs.readFileSync(path.join(dir, file), "utf8");
            console.log("→", file);
            await pool.query(sql);
        } catch (error) {
            console.error(`❌ Failed to apply migration: ${file}`);
            throw error;
        }
    }

    console.log("✅ All migrations applied successfully!");
    await pool.end();
}

// allow: pnpm tsx src/platform/db/migrate.ts
if (process.argv[1].includes("migrate")) {
    migrate().catch((err) => {
        console.error("❌ Migration failed:", err);
        process.exit(1);
    });
}