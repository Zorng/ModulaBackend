-- Optional dev seed data (NOT executed by `pnpm migrate`)
-- Run via:
--   pnpm seed:dev
-- or:
--   psql "$DATABASE_URL" -f migrations/_seed_dev.sql
--
-- Notes:
-- - Intended for local development only.
-- - Assumes all schema migrations have been applied.
-- - Password for all seeded accounts: "Test123!"
-- - Password hash is bcrypt (rounds=12) for "Test123!".

-- ---------------------------------------------------------------------
-- Tenants
-- ---------------------------------------------------------------------
INSERT INTO tenants (id, name, business_type, status) VALUES
  ('550e8400-e29b-41d4-a716-446655440000', 'Test Restaurant', 'RESTAURANT', 'ACTIVE'),
  ('550e8400-e29b-41d4-a716-446655440100', 'Coffee Shop Co', 'CAFE', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Branches
-- ---------------------------------------------------------------------
INSERT INTO branches (id, tenant_id, name, address, status) VALUES
  ('660e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440000', 'Main Branch', '123 Main Street, City Center', 'ACTIVE'),
  ('660e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440000', 'Downtown Branch', '456 Downtown Ave, Business District', 'ACTIVE'),
  ('660e8400-e29b-41d4-a716-446655440100', '550e8400-e29b-41d4-a716-446655440100', 'Central Cafe', '789 Coffee Lane, Arts District', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Accounts (login identities)
-- ---------------------------------------------------------------------
INSERT INTO accounts (id, phone, password_hash, status, created_at, updated_at) VALUES
  ('880e8400-e29b-41d4-a716-446655440010', '+1234567890', '$2b$12$2tEqR2fsxAOgcXCjDqbsA.0qZhePT6ea.epSVTuJcaF2tZIowBauu', 'ACTIVE', NOW(), NOW()),
  ('880e8400-e29b-41d4-a716-446655440011', '+1234567891', '$2b$12$2tEqR2fsxAOgcXCjDqbsA.0qZhePT6ea.epSVTuJcaF2tZIowBauu', 'ACTIVE', NOW(), NOW()),
  ('880e8400-e29b-41d4-a716-446655440012', '+1234567892', '$2b$12$2tEqR2fsxAOgcXCjDqbsA.0qZhePT6ea.epSVTuJcaF2tZIowBauu', 'ACTIVE', NOW(), NOW()),
  ('880e8400-e29b-41d4-a716-446655440013', '+1234567893', '$2b$12$2tEqR2fsxAOgcXCjDqbsA.0qZhePT6ea.epSVTuJcaF2tZIowBauu', 'ACTIVE', NOW(), NOW()),
  ('880e8400-e29b-41d4-a716-446655440100', '+1555123001', '$2b$12$2tEqR2fsxAOgcXCjDqbsA.0qZhePT6ea.epSVTuJcaF2tZIowBauu', 'ACTIVE', NOW(), NOW()),
  ('880e8400-e29b-41d4-a716-446655440101', '+1555123002', '$2b$12$2tEqR2fsxAOgcXCjDqbsA.0qZhePT6ea.epSVTuJcaF2tZIowBauu', 'ACTIVE', NOW(), NOW())
ON CONFLICT (phone) DO NOTHING;

-- ---------------------------------------------------------------------
-- Employees (tenant memberships)
-- ---------------------------------------------------------------------
INSERT INTO employees (
  id,
  tenant_id,
  account_id,
  phone,
  email,
  password_hash,
  first_name,
  last_name,
  display_name,
  default_branch_id,
  last_branch_id,
  status,
  created_at,
  updated_at
) VALUES
  -- Test Restaurant memberships
  ('770e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440000', '880e8400-e29b-41d4-a716-446655440010', '+1234567890', 'admin@test.com',   '$2b$12$2tEqR2fsxAOgcXCjDqbsA.0qZhePT6ea.epSVTuJcaF2tZIowBauu', 'Admin', 'User',    'Admin',   '660e8400-e29b-41d4-a716-446655440000', '660e8400-e29b-41d4-a716-446655440000', 'ACTIVE', NOW(), NOW()),
  ('770e8400-e29b-41d4-a716-446655440011', '550e8400-e29b-41d4-a716-446655440000', '880e8400-e29b-41d4-a716-446655440011', '+1234567891', 'manager@test.com', '$2b$12$2tEqR2fsxAOgcXCjDqbsA.0qZhePT6ea.epSVTuJcaF2tZIowBauu', 'John',  'Manager', 'Manager', '660e8400-e29b-41d4-a716-446655440000', '660e8400-e29b-41d4-a716-446655440000', 'ACTIVE', NOW(), NOW()),
  ('770e8400-e29b-41d4-a716-446655440012', '550e8400-e29b-41d4-a716-446655440000', '880e8400-e29b-41d4-a716-446655440012', '+1234567892', 'cashier@test.com', '$2b$12$2tEqR2fsxAOgcXCjDqbsA.0qZhePT6ea.epSVTuJcaF2tZIowBauu', 'Jane',  'Cashier', 'Cashier', '660e8400-e29b-41d4-a716-446655440000', '660e8400-e29b-41d4-a716-446655440000', 'ACTIVE', NOW(), NOW()),
  ('770e8400-e29b-41d4-a716-446655440013', '550e8400-e29b-41d4-a716-446655440000', '880e8400-e29b-41d4-a716-446655440013', '+1234567893', 'clerk@test.com',   '$2b$12$2tEqR2fsxAOgcXCjDqbsA.0qZhePT6ea.epSVTuJcaF2tZIowBauu', 'Bob',   'Smith',   'Clerk',   '660e8400-e29b-41d4-a716-446655440001', '660e8400-e29b-41d4-a716-446655440001', 'ACTIVE', NOW(), NOW()),

  -- Coffee Shop Co memberships
  ('770e8400-e29b-41d4-a716-446655440100', '550e8400-e29b-41d4-a716-446655440100', '880e8400-e29b-41d4-a716-446655440100', '+1555123001', 'owner@coffee.com', '$2b$12$2tEqR2fsxAOgcXCjDqbsA.0qZhePT6ea.epSVTuJcaF2tZIowBauu', 'Sarah', 'Brown',   'Owner',   '660e8400-e29b-41d4-a716-446655440100', '660e8400-e29b-41d4-a716-446655440100', 'ACTIVE', NOW(), NOW()),
  ('770e8400-e29b-41d4-a716-446655440101', '550e8400-e29b-41d4-a716-446655440100', '880e8400-e29b-41d4-a716-446655440101', '+1555123002', 'barista@coffee.com', '$2b$12$2tEqR2fsxAOgcXCjDqbsA.0qZhePT6ea.epSVTuJcaF2tZIowBauu', 'Mike',  'Johnson', 'Barista', '660e8400-e29b-41d4-a716-446655440100', '660e8400-e29b-41d4-a716-446655440100', 'ACTIVE', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Branch assignments
-- ---------------------------------------------------------------------
INSERT INTO employee_branch_assignments (employee_id, branch_id, role, active, assigned_at) VALUES
  ('770e8400-e29b-41d4-a716-446655440010', '660e8400-e29b-41d4-a716-446655440000', 'ADMIN', TRUE, NOW()),
  ('770e8400-e29b-41d4-a716-446655440010', '660e8400-e29b-41d4-a716-446655440001', 'ADMIN', TRUE, NOW()),
  ('770e8400-e29b-41d4-a716-446655440011', '660e8400-e29b-41d4-a716-446655440000', 'MANAGER', TRUE, NOW()),
  ('770e8400-e29b-41d4-a716-446655440012', '660e8400-e29b-41d4-a716-446655440000', 'CASHIER', TRUE, NOW()),
  ('770e8400-e29b-41d4-a716-446655440012', '660e8400-e29b-41d4-a716-446655440001', 'CASHIER', TRUE, NOW()),
  ('770e8400-e29b-41d4-a716-446655440013', '660e8400-e29b-41d4-a716-446655440001', 'CLERK', TRUE, NOW()),
  ('770e8400-e29b-41d4-a716-446655440100', '660e8400-e29b-41d4-a716-446655440100', 'ADMIN', TRUE, NOW()),
  ('770e8400-e29b-41d4-a716-446655440101', '660e8400-e29b-41d4-a716-446655440100', 'CASHIER', TRUE, NOW())
ON CONFLICT (employee_id, branch_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Default policy rows (so policy endpoints are immediately usable)
-- ---------------------------------------------------------------------
INSERT INTO sales_policies (tenant_id) VALUES
  ('550e8400-e29b-41d4-a716-446655440000'),
  ('550e8400-e29b-41d4-a716-446655440100')
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO inventory_policies (tenant_id) VALUES
  ('550e8400-e29b-41d4-a716-446655440000'),
  ('550e8400-e29b-41d4-a716-446655440100')
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO cash_session_policies (tenant_id) VALUES
  ('550e8400-e29b-41d4-a716-446655440000'),
  ('550e8400-e29b-41d4-a716-446655440100')
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO attendance_policies (tenant_id) VALUES
  ('550e8400-e29b-41d4-a716-446655440000'),
  ('550e8400-e29b-41d4-a716-446655440100')
ON CONFLICT (tenant_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Tenant limits (defaults via DB columns)
-- ---------------------------------------------------------------------
INSERT INTO tenant_limits (tenant_id) VALUES
  ('550e8400-e29b-41d4-a716-446655440000'),
  ('550e8400-e29b-41d4-a716-446655440100')
ON CONFLICT (tenant_id) DO NOTHING;

