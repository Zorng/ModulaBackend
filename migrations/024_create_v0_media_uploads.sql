-- Media upload lifecycle tracking
-- Used to link uploaded assets to domain entities and clean orphaned uploads.

CREATE TABLE IF NOT EXISTS v0_media_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  area VARCHAR(32) NOT NULL CHECK (area IN ('menu', 'inventory', 'tenant', 'profile')),
  object_key TEXT NOT NULL UNIQUE,
  image_url TEXT NOT NULL,
  mime_type VARCHAR(128) NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  status VARCHAR(24) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PENDING_DELETE', 'LINKED', 'DELETED')),
  linked_entity_type VARCHAR(64) NULL,
  linked_entity_id TEXT NULL,
  uploaded_by_account_id UUID NULL REFERENCES accounts(id) ON DELETE SET NULL,
  linked_at TIMESTAMPTZ NULL,
  deleted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v0_media_uploads_tenant_status_created
  ON v0_media_uploads(tenant_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_v0_media_uploads_status_created
  ON v0_media_uploads(status, created_at);

CREATE INDEX IF NOT EXISTS idx_v0_media_uploads_tenant_area_status
  ON v0_media_uploads(tenant_id, area, status);
