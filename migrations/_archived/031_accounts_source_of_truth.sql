-- Migration: Make accounts the source of truth for phone/email/password
-- Purpose: Keep employee credentials in sync with account credentials to avoid drift

-- Add email to accounts (optional, shared across memberships)
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Backfill account emails from existing employees (most recently updated wins)
WITH ranked_emails AS (
  SELECT DISTINCT ON (account_id)
    account_id,
    email
  FROM employees
  WHERE email IS NOT NULL AND email <> ''
  ORDER BY account_id, updated_at DESC
)
UPDATE accounts a
SET email = r.email
FROM ranked_emails r
WHERE a.id = r.account_id
  AND (a.email IS NULL OR a.email = '');

-- Ensure employee credentials mirror the account record
CREATE OR REPLACE FUNCTION sync_employee_credentials_from_account()
RETURNS TRIGGER AS $$
DECLARE
  account_phone VARCHAR(20);
  account_password TEXT;
  account_email VARCHAR(255);
BEGIN
  SELECT phone, password_hash, email
  INTO account_phone, account_password, account_email
  FROM accounts
  WHERE id = NEW.account_id;

  IF account_phone IS NULL OR account_password IS NULL THEN
    RAISE EXCEPTION 'Account not found for employee account_id=%', NEW.account_id;
  END IF;

  IF account_email IS NULL AND NEW.email IS NOT NULL THEN
    UPDATE accounts
    SET email = NEW.email, updated_at = NOW()
    WHERE id = NEW.account_id;
    account_email := NEW.email;
  END IF;

  NEW.phone = account_phone;
  NEW.password_hash = account_password;
  NEW.email = account_email;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_employee_credentials ON employees;
CREATE TRIGGER trigger_sync_employee_credentials
BEFORE INSERT OR UPDATE ON employees
FOR EACH ROW
EXECUTE FUNCTION sync_employee_credentials_from_account();

-- Propagate account updates to all memberships
CREATE OR REPLACE FUNCTION propagate_account_credentials_to_employees()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE employees
  SET phone = NEW.phone,
      password_hash = NEW.password_hash,
      email = NEW.email,
      updated_at = NOW()
  WHERE account_id = NEW.id
    AND (
      phone IS DISTINCT FROM NEW.phone
      OR password_hash IS DISTINCT FROM NEW.password_hash
      OR email IS DISTINCT FROM NEW.email
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_accounts_sync_employee_credentials ON accounts;
CREATE TRIGGER trigger_accounts_sync_employee_credentials
AFTER UPDATE OF phone, password_hash, email ON accounts
FOR EACH ROW
EXECUTE FUNCTION propagate_account_credentials_to_employees();
