-- v0 auth provider pivot
-- Allow Supabase to be source of truth for credentials while accounts keeps business profile facts.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS supabase_user_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_supabase_user_id
  ON accounts(supabase_user_id)
  WHERE supabase_user_id IS NOT NULL;

ALTER TABLE accounts
  ALTER COLUMN password_hash DROP NOT NULL;
