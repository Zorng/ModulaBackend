import type { Pool, PoolClient } from "pg";
import type { StorePolicyInventoryRepository as IStorePoliyInventoryRepository } from "../domain/repositories.js";
import { StorePolicyInventory } from "../domain/entities.js";

export class StorePolicyInventoryRepository implements IStorePoliyInventoryRepository {
    private pool: Pool;

    constructor(pool: Pool) {
        this.pool = pool;
    }

    async findByTenant(tenantId: string): Promise<StorePolicyInventory | null> {
        const client = await this.pool.connect();
        try {
            const res = await client.query(
                `SELECT * FROM store_policy_inventory WHERE tenant_id = $1 LIMIT 1`,
                [tenantId]
            );
            if (res.rows.length === 0) return null;
            return new StorePolicyInventory(res.rows[0]);
        } finally {
            client.release();
        }
    }

    async save(policy: Omit<StorePolicyInventory, "updatedAt">): Promise<StorePolicyInventory> {
        const client = await this.pool.connect();
        try {
            const now = new Date();
            const res = await client.query(
                `INSERT INTO store_policy_inventory (tenant_id, policy_data, updated_at)
                 VALUES ($1, $2, $3)
                 RETURNING *`,
                [policy.tenantId, policy.policyData, now]
            );
            return new StorePolicyInventory(res.rows[0]);
        } finally {
            client.release();
        }
    }

    async update(
        tenantId: string,
        updates: Partial<Omit<StorePolicyInventory, "tenantId" | "updatedAt">>
    ): Promise<StorePolicyInventory | null> {
        const client = await this.pool.connect();
        try {
            const fields = [];
            const values = [];
            let idx = 2;
            for (const [key, value] of Object.entries(updates)) {
                fields.push(`${key} = $${idx}`);
                values.push(value);
                idx++;
            }
            if (fields.length === 0) return null;
            values.unshift(tenantId);
            values.push(new Date());
            const query = `
                UPDATE store_policy_inventory
                SET ${fields.join(", ")}, updated_at = $${idx}
                WHERE tenant_id = $1
                RETURNING *`;
            const res = await client.query(query, values);
            if (res.rows.length === 0) return null;
            return new StorePolicyInventory(res.rows[0]);
        } finally {
            client.release();
        }
    }
}