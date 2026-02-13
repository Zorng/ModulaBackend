-- Migration: Create cash management tables
-- Description: Creates tables for cash registers, sessions, and movements as per the Cash Session & Reconciliation spec

-- Note: shared extensions are created in `migrations/000_platform_bootstrap.sql`

-- Create cash_registers table
CREATE TABLE IF NOT EXISTS cash_registers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(20) CHECK (status IN ('ACTIVE', 'INACTIVE')) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create cash_sessions table
CREATE TABLE IF NOT EXISTS cash_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    register_id UUID REFERENCES cash_registers(id) ON DELETE CASCADE,
    opened_by UUID NOT NULL REFERENCES employees(id),
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    opening_float_usd DECIMAL(10,2) DEFAULT 0,
    opening_float_khr DECIMAL(10,2) DEFAULT 0,
    status VARCHAR(20) CHECK (status IN ('OPEN', 'CLOSED', 'PENDING_REVIEW', 'APPROVED')) DEFAULT 'OPEN',
    closed_by UUID REFERENCES employees(id),
    closed_at TIMESTAMPTZ,
    expected_cash_usd DECIMAL(10,2) DEFAULT 0,
    expected_cash_khr DECIMAL(10,2) DEFAULT 0,
    counted_cash_usd DECIMAL(10,2) DEFAULT 0,
    counted_cash_khr DECIMAL(10,2) DEFAULT 0,
    variance_usd DECIMAL(10,2) DEFAULT 0,
    variance_khr DECIMAL(10,2) DEFAULT 0,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique partial index to ensure only one OPEN session per (tenant, branch) when register_id is NULL
-- This prevents multiple device-agnostic sessions from being opened simultaneously
CREATE UNIQUE INDEX IF NOT EXISTS unique_open_session_no_register 
    ON cash_sessions (tenant_id, branch_id) 
    WHERE status = 'OPEN' AND register_id IS NULL;

-- Create unique partial index to ensure only one OPEN session per (tenant, register) when register_id is provided
-- This maintains the original behavior for register-based sessions
CREATE UNIQUE INDEX IF NOT EXISTS unique_open_session_with_register 
    ON cash_sessions (tenant_id, register_id) 
    WHERE status = 'OPEN' AND register_id IS NOT NULL;

-- Create cash_movements table
CREATE TABLE IF NOT EXISTS cash_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    register_id UUID REFERENCES cash_registers(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES employees(id),
    type VARCHAR(20) CHECK (type IN ('SALE_CASH', 'REFUND_CASH', 'PAID_IN', 'PAID_OUT', 'ADJUSTMENT')),
    status VARCHAR(20) CHECK (status IN ('APPROVED', 'PENDING', 'DECLINED')) DEFAULT 'APPROVED',
    amount_usd DECIMAL(10,2) DEFAULT 0,
    amount_khr DECIMAL(10,2) DEFAULT 0,
    ref_sale_id UUID REFERENCES sales(id),
    reason VARCHAR(120),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comments explaining optional register_id
COMMENT ON COLUMN cash_sessions.register_id IS 'Optional - NULL for device-agnostic sessions (e.g., web browsers), set for terminal/register-specific sessions';
COMMENT ON COLUMN cash_movements.register_id IS 'Optional - NULL for device-agnostic sessions, set for terminal/register-specific sessions';

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_cash_sessions_tenant_branch ON cash_sessions (tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_register ON cash_sessions (register_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_session ON cash_movements (session_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_register ON cash_movements (register_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_actor ON cash_movements (actor_id);
