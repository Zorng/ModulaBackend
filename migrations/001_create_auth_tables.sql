-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- Enable pgcrypto for gen_random_uuid() used by other migrations
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Tenants table
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    business_type VARCHAR(100),
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAST_DUE','EXPIRED','CANCELED')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Branches table
CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Employees table
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    password_hash TEXT NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'INVITED' CHECK (status IN ('ACTIVE','INVITED','DISABLED')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, phone)
);

-- Employee branch assignments table
CREATE TABLE IF NOT EXISTS employee_branch_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN','MANAGER','CASHIER','CLERK')),
    active BOOLEAN DEFAULT TRUE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id, branch_id)
);

-- Invites table
CREATE TABLE IF NOT EXISTS invites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('MANAGER','CASHIER','CLERK')),
    phone VARCHAR(20) NOT NULL,
    token_hash TEXT NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    note TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, phone, branch_id, role)
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL
);

-- Activity log table
CREATE TABLE IF NOT EXISTS activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    action_type VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_employees_tenant_phone ON employees(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employee_branch_assignments_employee ON employee_branch_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_branch_assignments_branch ON employee_branch_assignments(branch_id);
CREATE INDEX IF NOT EXISTS idx_invites_token_hash ON invites(token_hash);
CREATE INDEX IF NOT EXISTS idx_invites_expires ON invites(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token ON sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_employee ON sessions(employee_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_tenant ON activity_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_employee ON activity_log(employee_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at);

-- Test data for frontend connection testing
-- Password for all test users: "Test123!"
-- Hash generated using bcrypt with salt rounds 12

-- Insert test tenants
INSERT INTO tenants (id, name, business_type, status) VALUES 
('550e8400-e29b-41d4-a716-446655440000', 'Test Restaurant', 'RESTAURANT', 'ACTIVE'),
('550e8400-e29b-41d4-a716-446655440100', 'Coffee Shop Co', 'CAFE', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- Insert test branches
-- Tenant 1: Test Restaurant - 2 branches
INSERT INTO branches (id, tenant_id, name, address) VALUES 
('660e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440000', 'Main Branch', '123 Main Street, City Center'),
('660e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440000', 'Downtown Branch', '456 Downtown Ave, Business District')
ON CONFLICT (id) DO NOTHING;

-- Tenant 2: Coffee Shop Co - 1 branch
INSERT INTO branches (id, tenant_id, name, address) VALUES 
('660e8400-e29b-41d4-a716-446655440100', '550e8400-e29b-41d4-a716-446655440100', 'Central Cafe', '789 Coffee Lane, Arts District')
ON CONFLICT (id) DO NOTHING;

-- Insert test employees for Test Restaurant
-- All users can login with password: Test123!
-- Admin: phone +1234567890, email admin@test.com
-- Manager: phone +1234567891, email manager@test.com
-- Cashier: phone +1234567892, email cashier@test.com
-- Clerk: phone +1234567893, email clerk@test.com
INSERT INTO employees (id, tenant_id, phone, email, password_hash, first_name, last_name, status) VALUES 
('770e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440000', '+1234567890', 'admin@test.com', '$2b$12$2tEqR2fsxAOgcXCjDqbsA.0qZhePT6ea.epSVTuJcaF2tZIowBauu', 'Admin', 'User', 'ACTIVE'),
('770e8400-e29b-41d4-a716-446655440011', '550e8400-e29b-41d4-a716-446655440000', '+1234567891', 'manager@test.com', '$2b$12$2tEqR2fsxAOgcXCjDqbsA.0qZhePT6ea.epSVTuJcaF2tZIowBauu', 'John', 'Manager', 'ACTIVE'),
('770e8400-e29b-41d4-a716-446655440012', '550e8400-e29b-41d4-a716-446655440000', '+1234567892', 'cashier@test.com', '$2b$12$2tEqR2fsxAOgcXCjDqbsA.0qZhePT6ea.epSVTuJcaF2tZIowBauu', 'Jane', 'Cashier', 'ACTIVE'),
('770e8400-e29b-41d4-a716-446655440013', '550e8400-e29b-41d4-a716-446655440000', '+1234567893', 'clerk@test.com', '$2b$12$2tEqR2fsxAOgcXCjDqbsA.0qZhePT6ea.epSVTuJcaF2tZIowBauu', 'Bob', 'Smith', 'ACTIVE')
ON CONFLICT (tenant_id, phone) DO NOTHING;

-- Insert test employees for Coffee Shop Co
-- Owner/Admin: phone +1555123001, email owner@coffee.com
-- Barista: phone +1555123002, email barista@coffee.com
INSERT INTO employees (id, tenant_id, phone, email, password_hash, first_name, last_name, status) VALUES 
('770e8400-e29b-41d4-a716-446655440100', '550e8400-e29b-41d4-a716-446655440100', '+1555123001', 'owner@coffee.com', '$2b$12$2tEqR2fsxAOgcXCjDqbsA.0qZhePT6ea.epSVTuJcaF2tZIowBauu', 'Sarah', 'Brown', 'ACTIVE'),
('770e8400-e29b-41d4-a716-446655440101', '550e8400-e29b-41d4-a716-446655440100', '+1555123002', 'barista@coffee.com', '$2b$12$2tEqR2fsxAOgcXCjDqbsA.0qZhePT6ea.epSVTuJcaF2tZIowBauu', 'Mike', 'Johnson', 'ACTIVE')
ON CONFLICT (tenant_id, phone) DO NOTHING;

-- Insert employee branch assignments for Test Restaurant
INSERT INTO employee_branch_assignments (employee_id, branch_id, role, active) VALUES 
('770e8400-e29b-41d4-a716-446655440010', '660e8400-e29b-41d4-a716-446655440000', 'ADMIN', TRUE),
('770e8400-e29b-41d4-a716-446655440010', '660e8400-e29b-41d4-a716-446655440001', 'ADMIN', TRUE),
('770e8400-e29b-41d4-a716-446655440011', '660e8400-e29b-41d4-a716-446655440000', 'MANAGER', TRUE),
('770e8400-e29b-41d4-a716-446655440012', '660e8400-e29b-41d4-a716-446655440000', 'CASHIER', TRUE),
('770e8400-e29b-41d4-a716-446655440012', '660e8400-e29b-41d4-a716-446655440001', 'CASHIER', TRUE),
('770e8400-e29b-41d4-a716-446655440013', '660e8400-e29b-41d4-a716-446655440001', 'CLERK', TRUE)
ON CONFLICT (employee_id, branch_id) DO NOTHING;

-- Insert employee branch assignments for Coffee Shop Co
INSERT INTO employee_branch_assignments (employee_id, branch_id, role, active) VALUES 
('770e8400-e29b-41d4-a716-446655440100', '660e8400-e29b-41d4-a716-446655440100', 'ADMIN', TRUE),
('770e8400-e29b-41d4-a716-446655440101', '660e8400-e29b-41d4-a716-446655440100', 'CASHIER', TRUE)
ON CONFLICT (employee_id, branch_id) DO NOTHING;
