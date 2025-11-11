import { pool } from '#db';

export const tenantRepo = {
    async create(name: string) {
        const { rows } = await pool.query(
            'INSERT INTO tenants (name) VALUES ($1) RETURNING *',
            [name]
        );
        return rows[0];
    },
    async list() {
        const { rows } = await pool.query(
            'SELECT * FROM tenants ORDER BY created_at DESC'
        );
        return rows;
    }
};