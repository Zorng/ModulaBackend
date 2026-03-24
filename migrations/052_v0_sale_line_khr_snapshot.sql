-- Sale-line KHR snapshot support for reporting consistency.
-- New sale writes persist canonical line-level KHR values.
-- Historical rows remain readable via reporting fallback until an explicit backfill decision is made.

ALTER TABLE v0_sale_lines
  ADD COLUMN IF NOT EXISTS line_total_khr_snapshot NUMERIC(14,2) NULL CHECK (line_total_khr_snapshot >= 0);

