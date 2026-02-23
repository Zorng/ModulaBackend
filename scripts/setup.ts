#!/usr/bin/env tsx
/**
 * Automated setup script for Modula Backend
 * This script handles:
 * - Environment file creation
 * - Database creation
 * - Migration execution
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

// Colors for terminal output
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    red: "\x1b[31m",
};

function log(message: string, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

function header(message: string) {
    console.log("\n");
    log("=".repeat(60), colors.blue);
    log(message, colors.bright + colors.blue);
    log("=".repeat(60), colors.blue);
}

function success(message: string) {
    log(`✅ ${message}`, colors.green);
}

function warning(message: string) {
    log(`⚠️  ${message}`, colors.yellow);
}

function error(message: string) {
    log(`❌ ${message}`, colors.red);
}

function info(message: string) {
    log(`ℹ️  ${message}`, colors.blue);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function prompt(question: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(`${colors.blue}${question}${colors.reset}`, (answer) => {
            resolve(answer.trim());
        });
    });
}

async function createEnvFile() {
    header("Step 1: Environment Configuration");

    const envLocalPath = path.join(ROOT_DIR, ".env.development.local");
    const envExamplePath = path.join(ROOT_DIR, ".env.example");

    if (fs.existsSync(envLocalPath)) {
        warning(".env.development.local already exists.");
        const overwrite = await prompt(
            "Do you want to overwrite it? (y/N): "
        );
        if (overwrite.toLowerCase() !== "y") {
            info("Keeping existing .env.development.local file.");
            return;
        }
    }

    // Read the example file
    if (!fs.existsSync(envExamplePath)) {
        error(".env.example not found!");
        process.exit(1);
    }

    let envContent = fs.readFileSync(envExamplePath, "utf8");

    // Prompt for database password
    const dbPassword = await prompt(
        "Enter your PostgreSQL password (default: postgres): "
    );
    const password = dbPassword || "postgres";

    // Prompt for database name
    const dbName = await prompt("Enter database name (default: modula): ");
    const database = dbName || "modula";

    // Prompt for database port
    const dbPort = await prompt(
        "Enter PostgreSQL port (default: 5432): "
    );
    const port = dbPort || "5432";

    // Generate random secrets for JWT
    const jwtSecret = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const jwtRefreshSecret = Math.random().toString(36).substring(2) + Date.now().toString(36);

    // Replace values in env content
    envContent = envContent
        .replace(
            /^DATABASE_URL=.*$/m,
            `DATABASE_URL=postgres://postgres:${password}@localhost:${port}/${database}`
        )
        .replace(
            /^JWT_SECRET=.*$/m,
            `JWT_SECRET=${jwtSecret}`
        )
        .replace(
            /^JWT_REFRESH_SECRET=.*$/m,
            `JWT_REFRESH_SECRET=${jwtRefreshSecret}`
        );

    // Write the file
    fs.writeFileSync(envLocalPath, envContent);
    success(".env.development.local created successfully!");

    return { password, database, port };
}

async function createDatabase(dbPassword: string, dbName: string, dbPort: string) {
    header("Step 2: Database Creation");

    try {
        // Check if database exists
        const checkCmd = process.platform === "win32"
            ? `SET PGPASSWORD=${dbPassword} && psql -U postgres -p ${dbPort} -lqt | findstr ${dbName}`
            : `PGPASSWORD=${dbPassword} psql -U postgres -p ${dbPort} -lqt | cut -d \\| -f 1 | grep -qw ${dbName}`;

        try {
            execSync(checkCmd, { stdio: "pipe" });
            warning(`Database '${dbName}' already exists.`);
            const recreate = await prompt(
                "Do you want to drop and recreate it? (y/N): "
            );
            if (recreate.toLowerCase() === "y") {
                const dropCmd = process.platform === "win32"
                    ? `SET PGPASSWORD=${dbPassword} && psql -U postgres -p ${dbPort} -c "DROP DATABASE ${dbName};"`
                    : `PGPASSWORD=${dbPassword} psql -U postgres -p ${dbPort} -c "DROP DATABASE ${dbName};"`;
                execSync(dropCmd, { stdio: "inherit" });
                info(`Database '${dbName}' dropped.`);
            } else {
                info("Keeping existing database.");
                return;
            }
        } catch {
            // Database doesn't exist, which is fine
        }

        // Create database
        const createCmd = process.platform === "win32"
            ? `SET PGPASSWORD=${dbPassword} && psql -U postgres -p ${dbPort} -c "CREATE DATABASE ${dbName};"`
            : `PGPASSWORD=${dbPassword} psql -U postgres -p ${dbPort} -c "CREATE DATABASE ${dbName};"`;

        execSync(createCmd, { stdio: "inherit" });
        success(`Database '${dbName}' created successfully!`);
    } catch (err) {
        error("Failed to create database.");
        error("Please make sure PostgreSQL is running and you have the correct credentials.");
        info("\nYou can create the database manually with:");
        info(`  psql -U postgres -c "CREATE DATABASE ${dbName};"`);
        throw err;
    }
}

async function runMigrations() {
    header("Step 3: Running Migrations");

    const migrationsDir = path.join(ROOT_DIR, "migrations");

    // Check if migrations directory exists
    if (!fs.existsSync(migrationsDir)) {
        warning("No migrations directory found. Creating it...");
        fs.mkdirSync(migrationsDir, { recursive: true });
        info("Place your SQL migration files in the 'migrations/' directory.");
        info("Example: migrations/001_create_auth_tables.sql");
        return;
    }

    // Check if there are any migration files
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

    if (files.length === 0) {
        warning("No migration files found in migrations/ directory.");
        info("Place your SQL migration files there (e.g., 001_create_tables.sql).");
        return;
    }

    info(`Found ${files.length} migration file(s):`);
    files.forEach((f) => log(`  - ${f}`, colors.blue));

    try {
        execSync("pnpm migrate", { stdio: "inherit", cwd: ROOT_DIR });
        success("Migrations completed successfully!");
    } catch (err) {
        error("Migration failed. Check the error above.");
        throw err;
    }
}

async function main() {
    try {
        log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║          🚀 Modula Backend Setup Wizard 🚀              ║
║                                                           ║
║  This script will help you set up the backend in         ║
║  just a few steps!                                        ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
        `, colors.bright + colors.blue);

        info("Before starting, make sure you have:");
        info("  ✓ PostgreSQL installed and running");
        info("  ✓ Node.js installed (v18+)");
        info("  ✓ pnpm installed");
        console.log();

        const proceed = await prompt("Ready to proceed? (Y/n): ");
        if (proceed.toLowerCase() === "n") {
            info("Setup cancelled.");
            rl.close();
            return;
        }

        // Step 1: Create environment file
        const envConfig = await createEnvFile();

        // Step 2: Create database
        if (envConfig) {
            await createDatabase(
                envConfig.password,
                envConfig.database,
                envConfig.port
            );
        }

        // Step 3: Run migrations
        await runMigrations();

        // Success message
        log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║              🎉 Setup Complete! 🎉                       ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
        `, colors.bright + colors.green);

        success("Your backend is ready to use!");
        console.log();
        info("Next steps:");
        info("  1. Start the development server: pnpm dev");
        info("  2. Run tests: pnpm test");
        info("  3. Check the API at: http://localhost:3000");
        console.log();
        info("To add more migrations:");
        info("  1. Place SQL files in migrations/ directory");
        info("  2. Run: pnpm migrate");

    } catch (err) {
        error("\n❌ Setup failed. Please check the errors above.");
        process.exit(1);
    } finally {
        rl.close();
    }
}

main();
