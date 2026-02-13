-- Add membership branch context fields to employees (used as Membership records)
-- Idempotent: safe to run multiple times

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS default_branch_id UUID;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS last_branch_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employees_default_branch_fk'
  ) THEN
    ALTER TABLE employees
      ADD CONSTRAINT employees_default_branch_fk
      FOREIGN KEY (default_branch_id) REFERENCES branches(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employees_last_branch_fk'
  ) THEN
    ALTER TABLE employees
      ADD CONSTRAINT employees_last_branch_fk
      FOREIGN KEY (last_branch_id) REFERENCES branches(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_employees_default_branch_id ON employees(default_branch_id);
CREATE INDEX IF NOT EXISTS idx_employees_last_branch_id ON employees(last_branch_id);

-- Backfill branch context from active assignments (best-effort)
WITH latest_assignment AS (
  SELECT DISTINCT ON (employee_id)
    employee_id,
    branch_id
  FROM employee_branch_assignments
  WHERE active = TRUE
  ORDER BY employee_id, assigned_at DESC
)
UPDATE employees e
SET default_branch_id = latest_assignment.branch_id
FROM latest_assignment
WHERE e.id = latest_assignment.employee_id
  AND e.default_branch_id IS NULL;

UPDATE employees
SET last_branch_id = COALESCE(last_branch_id, default_branch_id)
WHERE last_branch_id IS NULL
  AND default_branch_id IS NOT NULL;

