-- v0 restart dev seed
-- This seed targets the fresh v0 baseline schema only.
--
-- Run via:
--   pnpm seed:dev
--
-- Notes:
-- - Password for seeded accounts: "Test123!"
-- - Keep data intentionally small; product demo fixtures can be added later.

INSERT INTO tenants (id, name, status)
VALUES ('11111111-1111-4111-8111-111111111111', 'Demo Tenant', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

INSERT INTO branches (id, tenant_id, name, status)
VALUES (
  '10000000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Main Branch',
  'ACTIVE'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO accounts (
  id,
  phone,
  password_hash,
  status,
  phone_verified_at,
  first_name,
  last_name
)
VALUES (
  '50000000-0000-4000-8000-000000000001',
  '+10000000001',
  '$2b$12$2tEqR2fsxAOgcXCjDqbsA.0qZhePT6ea.epSVTuJcaF2tZIowBauu',
  'ACTIVE',
  NOW(),
  'Demo',
  'Owner'
)
ON CONFLICT (phone) DO NOTHING;
