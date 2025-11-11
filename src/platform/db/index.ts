import { Pool } from 'pg';
import '../config/index.js';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export async function ping() {
  const { rows } = await pool.query('select now() as now');
  return rows[0].now as string;
}