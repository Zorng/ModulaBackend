import type { Pool, PoolClient } from "pg";
import type {
  Branch,
  Tenant,
  TenantMetadata,
  TenantProfile,
  TenantProfileUpdate,
  TenantStatus,
} from "../domain/entities.js";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export class TenantRepository {
  private readonly metadataCacheTtlMs: number;
  private readonly metadataCache = new Map<
    string,
    { value: TenantMetadata; expiresAt: number }
  >();

  constructor(
    private pool: Pool,
    opts?: {
      metadataCacheTtlMs?: number;
    }
  ) {
    this.metadataCacheTtlMs = Math.max(0, opts?.metadataCacheTtlMs ?? 60_000);
  }

  async createTenant(
    tenant: Pick<Tenant, "name"> &
      Partial<Pick<Tenant, "business_type" | "status">>,
    client?: PoolClient
  ): Promise<Tenant> {
    const db: Queryable = client ?? this.pool;
    const result = await db.query(
      `INSERT INTO tenants (name, business_type, status)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [tenant.name, tenant.business_type ?? null, tenant.status ?? "ACTIVE"]
    );
    return this.mapTenant(result.rows[0]);
  }

  async createBranch(
    branch: Pick<Branch, "tenant_id" | "name"> & Partial<Pick<Branch, "address">>,
    client?: PoolClient
  ): Promise<Branch> {
    const db: Queryable = client ?? this.pool;
    const result = await db.query(
      `INSERT INTO branches (tenant_id, name, address)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [branch.tenant_id, branch.name, branch.address ?? null]
    );
    return this.mapBranch(result.rows[0]);
  }

  async findTenantById(
    tenantId: string,
    client?: PoolClient
  ): Promise<Tenant | null> {
    const db: Queryable = client ?? this.pool;
    const result = await db.query(`SELECT * FROM tenants WHERE id = $1`, [
      tenantId,
    ]);
    if (result.rows.length === 0) return null;
    return this.mapTenant(result.rows[0]);
  }

  async getTenantProfile(
    tenantId: string,
    client?: PoolClient
  ): Promise<TenantProfile | null> {
    const db: Queryable = client ?? this.pool;
    const result = await db.query(
      `SELECT
         t.*,
         (SELECT COUNT(*)::INT FROM branches b WHERE b.tenant_id = t.id) AS branch_count
       FROM tenants t
       WHERE t.id = $1`,
      [tenantId]
    );
    if (result.rows.length === 0) return null;
    return this.mapTenantProfile(result.rows[0]);
  }

  async getTenantMetadata(
    tenantId: string,
    client?: PoolClient
  ): Promise<TenantMetadata | null> {
    if (!client && this.metadataCacheTtlMs > 0) {
      const cached = this.metadataCache.get(tenantId) ?? null;
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
      }
      if (cached) {
        this.metadataCache.delete(tenantId);
      }
    }

    const db: Queryable = client ?? this.pool;
    const result = await db.query(
      `SELECT id, name, logo_url, status
       FROM tenants
       WHERE id = $1`,
      [tenantId]
    );
    if (result.rows.length === 0) return null;
    const value = this.mapTenantMetadata(result.rows[0]);

    if (!client && this.metadataCacheTtlMs > 0) {
      this.metadataCache.set(tenantId, {
        value,
        expiresAt: Date.now() + this.metadataCacheTtlMs,
      });
    }

    return value;
  }

  async updateTenantProfile(
    tenantId: string,
    updates: TenantProfileUpdate,
    client?: PoolClient
  ): Promise<Tenant> {
    const db: Queryable = client ?? this.pool;
    const setClauses: string[] = [];
    const values: any[] = [tenantId];
    let paramIndex = 2;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.contact_phone !== undefined) {
      setClauses.push(`contact_phone = $${paramIndex++}`);
      values.push(updates.contact_phone);
    }
    if (updates.contact_email !== undefined) {
      setClauses.push(`contact_email = $${paramIndex++}`);
      values.push(updates.contact_email);
    }
    if (updates.contact_address !== undefined) {
      setClauses.push(`contact_address = $${paramIndex++}`);
      values.push(updates.contact_address);
    }

    if (setClauses.length === 0) {
      const current = await this.findTenantById(tenantId, client);
      if (!current) {
        throw new Error("Tenant not found");
      }
      return current;
    }

    const result = await db.query(
      `UPDATE tenants
       SET ${setClauses.join(", ")}
       WHERE id = $1
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new Error("Tenant not found");
    }
    this.metadataCache.delete(tenantId);
    return this.mapTenant(result.rows[0]);
  }

  async updateTenantLogo(
    tenantId: string,
    logoUrl: string | null,
    client?: PoolClient
  ): Promise<Tenant> {
    const db: Queryable = client ?? this.pool;
    const result = await db.query(
      `UPDATE tenants
       SET logo_url = $2
       WHERE id = $1
       RETURNING *`,
      [tenantId, logoUrl]
    );
    if (result.rows.length === 0) {
      throw new Error("Tenant not found");
    }
    this.metadataCache.delete(tenantId);
    return this.mapTenant(result.rows[0]);
  }

  async writeAuditLog(
    entry: {
      tenantId: string;
      branchId?: string;
      employeeId?: string;
      actionType: string;
      resourceType?: string;
      resourceId?: string;
      details?: Record<string, any>;
    },
    client?: PoolClient
  ): Promise<void> {
    const db: Queryable = client ?? this.pool;
    await db.query(
      `INSERT INTO activity_log
        (tenant_id, branch_id, employee_id, action_type, resource_type, resource_id, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        entry.tenantId,
        entry.branchId ?? null,
        entry.employeeId ?? null,
        entry.actionType,
        entry.resourceType ?? null,
        entry.resourceId ?? null,
        entry.details ? JSON.stringify(entry.details) : null,
      ]
    );
  }

  private mapTenant(row: any): Tenant {
    return {
      id: row.id,
      name: row.name,
      business_type: row.business_type,
      status: row.status as TenantStatus,
      logo_url: row.logo_url ?? null,
      contact_phone: row.contact_phone ?? null,
      contact_email: row.contact_email ?? null,
      contact_address: row.contact_address ?? null,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  private mapTenantProfile(row: any): TenantProfile {
    return {
      ...this.mapTenant(row),
      branch_count: Number(row.branch_count ?? 0),
    };
  }

  private mapTenantMetadata(row: any): TenantMetadata {
    return {
      id: row.id,
      name: row.name,
      logo_url: row.logo_url ?? null,
      status: row.status as TenantStatus,
    };
  }

  private mapBranch(row: any): Branch {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      name: row.name,
      address: row.address ?? null,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }
}
