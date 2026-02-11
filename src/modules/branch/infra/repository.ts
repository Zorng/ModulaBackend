import type { Pool, PoolClient } from "pg";
import type { Branch, BranchProfileUpdate, BranchStatus } from "../domain/entities.js";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export class BranchRepository {
  constructor(private pool: Pool) {}

  async createBranch(
    params: {
      tenant_id: string;
      name: string;
      address?: string | null;
      contact_phone?: string | null;
      contact_email?: string | null;
      status?: BranchStatus;
    },
    client?: PoolClient
  ): Promise<Branch> {
    const db: Queryable = client ?? this.pool;
    const result = await db.query(
      `INSERT INTO branches (tenant_id, name, address, contact_phone, contact_email, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        params.tenant_id,
        params.name,
        params.address ?? null,
        params.contact_phone ?? null,
        params.contact_email ?? null,
        params.status ?? "ACTIVE",
      ]
    );
    return this.mapBranch(result.rows[0]);
  }

  async findBranchById(
    tenantId: string,
    branchId: string,
    client?: PoolClient
  ): Promise<Branch | null> {
    const db: Queryable = client ?? this.pool;
    const result = await db.query(
      `SELECT *
       FROM branches
       WHERE id = $1 AND tenant_id = $2`,
      [branchId, tenantId]
    );
    if (result.rows.length === 0) return null;
    return this.mapBranch(result.rows[0]);
  }

  async listBranchesForTenant(tenantId: string): Promise<Branch[]> {
    const result = await this.pool.query(
      `SELECT *
       FROM branches
       WHERE tenant_id = $1
       ORDER BY created_at ASC`,
      [tenantId]
    );
    return result.rows.map((row: any) => this.mapBranch(row));
  }

  async listBranchesForEmployee(params: {
    tenantId: string;
    employeeId: string;
  }): Promise<Branch[]> {
    const result = await this.pool.query(
      `SELECT DISTINCT b.*
       FROM employee_branch_assignments eba
       JOIN branches b ON b.id = eba.branch_id
       WHERE eba.employee_id = $1
         AND eba.active = TRUE
         AND b.tenant_id = $2
       ORDER BY b.created_at ASC`,
      [params.employeeId, params.tenantId]
    );
    return result.rows.map((row: any) => this.mapBranch(row));
  }

  async updateBranchProfile(params: {
    tenantId: string;
    branchId: string;
    updates: BranchProfileUpdate;
  }): Promise<Branch> {
    const setClauses: string[] = [];
    const values: any[] = [params.branchId, params.tenantId];
    let paramIndex = 3;

    if (params.updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(params.updates.name);
    }
    if (params.updates.address !== undefined) {
      setClauses.push(`address = $${paramIndex++}`);
      values.push(params.updates.address);
    }
    if (params.updates.contact_phone !== undefined) {
      setClauses.push(`contact_phone = $${paramIndex++}`);
      values.push(params.updates.contact_phone);
    }
    if (params.updates.contact_email !== undefined) {
      setClauses.push(`contact_email = $${paramIndex++}`);
      values.push(params.updates.contact_email);
    }

    if (setClauses.length === 0) {
      const current = await this.findBranchById(params.tenantId, params.branchId);
      if (!current) {
        throw new Error("Branch not found");
      }
      return current;
    }

    const result = await this.pool.query(
      `UPDATE branches
       SET ${setClauses.join(", ")}
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      values
    );
    if (result.rows.length === 0) {
      throw new Error("Branch not found");
    }
    return this.mapBranch(result.rows[0]);
  }

  async setBranchStatus(params: {
    tenantId: string;
    branchId: string;
    status: BranchStatus;
  }): Promise<Branch> {
    const result = await this.pool.query(
      `UPDATE branches
       SET status = $3
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [params.branchId, params.tenantId, params.status]
    );
    if (result.rows.length === 0) {
      throw new Error("Branch not found");
    }
    return this.mapBranch(result.rows[0]);
  }

  private mapBranch(row: any): Branch {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      name: row.name,
      address: row.address ?? null,
      contact_phone: row.contact_phone ?? null,
      contact_email: row.contact_email ?? null,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
