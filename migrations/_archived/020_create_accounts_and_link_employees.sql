-- Create Accounts table and link existing Employees (memberships) to Accounts.
-- Note: migrations are re-run on each start (no migration table), so all statements must be idempotent.

-- Accounts (login identity: phone + password)
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(20) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
    phone_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Link employees (membership) to accounts
ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS account_id UUID;

-- Backfill accounts from existing employees (seed/test data)
INSERT INTO accounts (phone, password_hash, status, created_at, updated_at)
SELECT DISTINCT ON (phone)
    phone,
    password_hash,
    'ACTIVE',
    NOW(),
    NOW()
FROM employees
WHERE phone IS NOT NULL AND password_hash IS NOT NULL
ORDER BY phone, updated_at DESC
ON CONFLICT (phone) DO NOTHING;

-- Populate employees.account_id from accounts.phone
UPDATE employees e
SET account_id = a.id
FROM accounts a
WHERE e.account_id IS NULL
  AND e.phone = a.phone;

-- Enforce that every employee (membership) belongs to an account
ALTER TABLE employees
    ALTER COLUMN account_id SET NOT NULL;

-- Best-effort: keep employee password hashes aligned with account password hashes.
-- (Employee password_hash will be deprecated later; for now it remains for compatibility.)
UPDATE employees e
SET password_hash = a.password_hash
FROM accounts a
WHERE e.account_id = a.id
  AND e.password_hash IS DISTINCT FROM a.password_hash;

CREATE INDEX IF NOT EXISTS idx_employees_account_id ON employees(account_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'employees_tenant_account_unique'
    ) THEN
        ALTER TABLE employees
            ADD CONSTRAINT employees_tenant_account_unique UNIQUE (tenant_id, account_id);
    END IF;
END $$;
