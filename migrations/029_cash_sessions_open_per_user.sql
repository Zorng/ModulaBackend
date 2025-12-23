-- Migration: Align cash session uniqueness to ModSpec (one OPEN per user per branch)
-- Purpose:
-- - Allow multiple cashiers to have their own OPEN sessions in the same branch.
-- - Keep existing register-level uniqueness (only one OPEN per register when register_id is set).

-- Device-agnostic sessions previously enforced ONE OPEN per branch; drop that constraint.
DROP INDEX IF EXISTS unique_open_session_no_register;

-- Enforce: one OPEN session per (tenant, branch, opened_by), regardless of register_id.
CREATE UNIQUE INDEX IF NOT EXISTS unique_open_session_per_user_branch
    ON cash_sessions (tenant_id, branch_id, opened_by)
    WHERE status = 'OPEN';

