import { Pool } from 'pg';
import { config } from '../config/index.js';

export const pool = new Pool({
  connectionString: config.database.url
});

export async function ping() {
  const { rows } = await pool.query('select now() as now');
  return rows[0].now as string;
}