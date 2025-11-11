import fs from "fs";
import path from "path";
import { pool } from "#db";

export async function migrate() {
    const dir = path.resolve("migrations");
    const files = fs.readdirSync(dir).sort();

    console.log("Applying migrations...");
    for (const file of files) {
        const sql = fs.readFileSync(path.join(dir, file), "utf8");
        console.log("→", file);
        await pool.query(sql);
    }

    console.log("✅ All migrations applied.");
    await pool.end();
}

// allow: pnpm tsx src/platform/db/migrate.ts
if (process.argv[1].includes("migrate")) {
    migrate().catch((err) => {
        console.error("❌ Migration failed:", err);
        process.exit(1);
    });
}