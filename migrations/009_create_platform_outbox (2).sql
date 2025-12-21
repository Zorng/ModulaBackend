-- Migration: Create platform-wide event outbox table
-- Purpose: Reliable event delivery using transactional outbox pattern
-- Dependencies: None (platform-level infrastructure)
-- Note: This should ideally be in platform/db/migrations, but included here for completeness

-- Event outbox for reliable event publishing
CREATE TABLE IF NOT EXISTS platform_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL, -- Event type (e.g., 'menu.item_created')
  payload JSONB NOT NULL, -- Full event payload
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ -- NULL = not sent yet, NOT NULL = successfully published
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_outbox_unsent ON platform_outbox(created_at) WHERE sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_outbox_tenant ON platform_outbox(tenant_id);
CREATE INDEX IF NOT EXISTS idx_outbox_type ON platform_outbox(type);

-- Cleanup old sent events (run this as a periodic job)
CREATE OR REPLACE FUNCTION cleanup_sent_outbox_events(retention_days INTEGER DEFAULT 7)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM platform_outbox
  WHERE sent_at IS NOT NULL 
    AND sent_at < NOW() - (retention_days || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE platform_outbox IS 'Transactional outbox for reliable event delivery across modules';
COMMENT ON COLUMN platform_outbox.sent_at IS 'Timestamp when event was successfully published to event bus';
COMMENT ON FUNCTION cleanup_sent_outbox_events IS 'Cleans up old sent events to prevent table bloat';
