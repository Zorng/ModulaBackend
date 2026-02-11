-- Extend branches with lifecycle status + contact fields (Branch module)
-- Idempotent: safe to run multiple times (migrations are replayed)

-- Add branch lifecycle + contact fields
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(30),
  ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);

-- Ensure default + non-null for status
ALTER TABLE branches
  ALTER COLUMN status SET DEFAULT 'ACTIVE';

UPDATE branches
SET status = 'ACTIVE'
WHERE status IS NULL;

ALTER TABLE branches
  ALTER COLUMN status SET NOT NULL;

-- Allowed status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'branches_status_check'
  ) THEN
    ALTER TABLE branches
      ADD CONSTRAINT branches_status_check CHECK (status IN ('ACTIVE', 'FROZEN'));
  END IF;
END $$;

-- Keep updated_at in sync (reuses update_row_updated_at from earlier migrations)
DROP TRIGGER IF EXISTS trigger_branches_updated_at ON branches;
CREATE TRIGGER trigger_branches_updated_at
  BEFORE UPDATE ON branches
  FOR EACH ROW
  EXECUTE FUNCTION update_row_updated_at();

-- Helpful indexes for common access paths
CREATE INDEX IF NOT EXISTS idx_branches_tenant_id ON branches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_branches_tenant_status ON branches(tenant_id, status);

-- Documentation
COMMENT ON COLUMN branches.status IS 'Branch lifecycle status (ACTIVE allows operational writes; FROZEN blocks operational writes).';
COMMENT ON COLUMN branches.contact_phone IS 'Branch contact phone (optional).';
COMMENT ON COLUMN branches.contact_email IS 'Branch contact email (optional).';

