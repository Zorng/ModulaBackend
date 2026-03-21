import type { Pool, PoolClient } from "pg";
import type { TenantImageArea } from "../storage/r2-image-storage.js";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

type MediaUploadStatus = "PENDING" | "PENDING_DELETE" | "LINKED" | "DELETED";
export type MediaUploadMembershipRole = "OWNER" | "ADMIN" | "MANAGER" | "CASHIER" | "CLERK";

export type V0MediaUploadRow = {
  id: string;
  tenant_id: string;
  area: TenantImageArea;
  object_key: string;
  image_url: string;
  mime_type: string;
  size_bytes: number;
  status: MediaUploadStatus;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  uploaded_by_account_id: string | null;
  linked_at: Date | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export class V0MediaUploadRepository {
  constructor(private readonly db: Queryable) {}

  async findActiveMembershipRole(input: {
    tenantId: string;
    accountId: string;
  }): Promise<MediaUploadMembershipRole | null> {
    const result = await this.db.query<{ role_key: MediaUploadMembershipRole }>(
      `SELECT role_key
       FROM v0_tenant_memberships
       WHERE tenant_id = $1
         AND account_id = $2
         AND status = 'ACTIVE'
       ORDER BY accepted_at DESC NULLS LAST, created_at DESC
       LIMIT 1`,
      [input.tenantId, input.accountId]
    );

    return result.rows[0]?.role_key ?? null;
  }

  async createPendingUpload(input: {
    tenantId: string;
    area: TenantImageArea;
    objectKey: string;
    imageUrl: string;
    mimeType: string;
    sizeBytes: number;
    uploadedByAccountId: string | null;
  }): Promise<V0MediaUploadRow> {
    const result = await this.db.query<V0MediaUploadRow>(
      `INSERT INTO v0_media_uploads (
         tenant_id,
         area,
         object_key,
         image_url,
         mime_type,
         size_bytes,
         status,
         uploaded_by_account_id
       ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7)
       RETURNING *`,
      [
        input.tenantId,
        input.area,
        input.objectKey,
        input.imageUrl,
        input.mimeType,
        input.sizeBytes,
        input.uploadedByAccountId,
      ]
    );
    return result.rows[0];
  }

  async markLinkedUploadByReference(input: {
    tenantId: string;
    area: TenantImageArea;
    imageUrl: string;
    objectKey: string | null;
    linkedEntityType: string;
    linkedEntityId: string;
  }): Promise<boolean> {
    const result = await this.db.query<{ id: string }>(
      `WITH candidate AS (
         SELECT id
         FROM v0_media_uploads
         WHERE tenant_id = $1
           AND area = $2
           AND status IN ('PENDING', 'PENDING_DELETE')
           AND (
             image_url = $3
             OR ($4::TEXT IS NOT NULL AND object_key = $4)
           )
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE
       )
       UPDATE v0_media_uploads u
       SET
         status = 'LINKED',
         linked_entity_type = $5,
         linked_entity_id = $6,
         linked_at = NOW(),
         updated_at = NOW()
       FROM candidate c
       WHERE u.id = c.id
       RETURNING u.id`,
      [
        input.tenantId,
        input.area,
        input.imageUrl,
        input.objectKey,
        input.linkedEntityType,
        input.linkedEntityId,
      ]
    );

    return Number(result.rowCount ?? 0) > 0;
  }

  async claimStalePendingUploads(input: {
    pendingAgeMinutes: number;
    batchSize: number;
  }): Promise<V0MediaUploadRow[]> {
    const result = await this.db.query<V0MediaUploadRow>(
      `WITH candidates AS (
         SELECT id
         FROM v0_media_uploads
         WHERE status = 'PENDING'
           AND created_at < NOW() - ($1::TEXT || ' minutes')::INTERVAL
         ORDER BY created_at ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED
       )
       UPDATE v0_media_uploads u
       SET
         status = 'PENDING_DELETE',
         updated_at = NOW()
       FROM candidates c
       WHERE u.id = c.id
       RETURNING u.*`,
      [input.pendingAgeMinutes, input.batchSize]
    );

    return result.rows;
  }

  async markDeleted(uploadId: string): Promise<void> {
    await this.db.query(
      `UPDATE v0_media_uploads
       SET
         status = 'DELETED',
         deleted_at = NOW(),
         updated_at = NOW()
       WHERE id = $1`,
      [uploadId]
    );
  }

  async markPending(uploadId: string): Promise<void> {
    await this.db.query(
      `UPDATE v0_media_uploads
       SET
         status = 'PENDING',
         updated_at = NOW()
       WHERE id = $1`,
      [uploadId]
    );
  }
}
