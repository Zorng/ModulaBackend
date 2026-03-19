ALTER TABLE v0_media_uploads
  DROP CONSTRAINT IF EXISTS v0_media_uploads_area_check;

ALTER TABLE v0_media_uploads
  ADD CONSTRAINT v0_media_uploads_area_check
  CHECK (area IN ('menu', 'inventory', 'tenant', 'profile', 'payment-proof'));
