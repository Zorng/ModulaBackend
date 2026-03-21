import { Pool } from 'pg';
import { config } from '../config/index.js';
import { parseBooleanEnv } from "../config/env.js";
import { log } from "#logger";
import { formatError } from "../errors/format.js";

const connectionTimeoutMillis = parsePositiveInteger(
  process.env.DB_CONNECTION_TIMEOUT_MS,
  10_000
);
const idleTimeoutMillis = parsePositiveInteger(
  process.env.DB_IDLE_TIMEOUT_MS,
  30_000
);
const maxConnections = parsePositiveInteger(process.env.DB_POOL_MAX, 10);
const keepAlive = parseBooleanEnv(process.env.DB_POOL_KEEP_ALIVE) ?? true;

export const pool = new Pool({
  connectionString: config.database.url,
  connectionTimeoutMillis,
  idleTimeoutMillis,
  max: maxConnections,
  keepAlive,
});

// pg emits pool-level client errors for idle/broken connections. Without a listener,
// EventEmitter treats them as unhandled and the process can exit.
pool.on("error", (error) => {
  log.error("db.pool.client_error", {
    event: "db.pool.client_error",
    error: formatError(error),
  });
});

export async function ping() {
  const { rows } = await pool.query('select now() as now');
  return rows[0].now as string;
}

function parsePositiveInteger(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}
