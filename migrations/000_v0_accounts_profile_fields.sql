-- Phase 1 (/v0 auth): move basic identity profile fields to accounts.
-- Keep nullable for backward compatibility with existing seeded/prototype data.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS gender VARCHAR(30);

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS date_of_birth DATE;
