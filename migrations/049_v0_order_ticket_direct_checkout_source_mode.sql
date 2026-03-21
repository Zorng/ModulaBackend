ALTER TABLE v0_order_tickets
  DROP CONSTRAINT IF EXISTS v0_order_tickets_source_mode_check;

ALTER TABLE v0_order_tickets
  ADD CONSTRAINT v0_order_tickets_source_mode_check
  CHECK (
    source_mode IN (
      'STANDARD',
      'MANUAL_EXTERNAL_PAYMENT_CLAIM',
      'DIRECT_CHECKOUT'
    )
  );
