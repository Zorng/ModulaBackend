-- Sales tables (in public schema)
CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_uuid UUID NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id),
    
    -- Sale context
    sale_type VARCHAR(20) NOT NULL CHECK (sale_type IN ('dine_in', 'take_away', 'delivery')),
    state VARCHAR(20) NOT NULL CHECK (state IN ('draft', 'finalized', 'voided', 'reopened')) DEFAULT 'draft',
    ref_previous_sale_id UUID DEFAULT NULL REFERENCES sales(id) ON DELETE SET NULL,
    
    -- VAT snapshot
    vat_enabled BOOLEAN NOT NULL DEFAULT false,
    vat_rate DECIMAL(5,4) DEFAULT 0,
    vat_amount_usd DECIMAL(12,2) DEFAULT 0,
    vat_amount_khr_exact INTEGER DEFAULT 0,
    
    -- Discounts
    applied_policy_ids JSONB DEFAULT '[]',
    order_discount_type VARCHAR(20) CHECK (order_discount_type IN ('percentage', 'fixed')),
    order_discount_amount DECIMAL(10,2) DEFAULT 0,
    policy_stale BOOLEAN DEFAULT FALSE,
    
    -- Currency & FX
    fx_rate_used DECIMAL(10,4) NOT NULL,
    subtotal_usd_exact DECIMAL(12,2) NOT NULL DEFAULT 0,
    subtotal_khr_exact INTEGER NOT NULL DEFAULT 0,
    total_usd_exact DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_khr_exact INTEGER NOT NULL DEFAULT 0,
    
    -- Tender & rounding
    tender_currency VARCHAR(3) NOT NULL CHECK (tender_currency IN ('KHR', 'USD')) DEFAULT 'USD',
    khr_rounding_applied BOOLEAN NOT NULL DEFAULT false,
    total_khr_rounded INTEGER DEFAULT 0,
    rounding_delta_khr INTEGER DEFAULT 0,
    
    -- Payment
    payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('cash', 'qr', 'transfer', 'other')) DEFAULT 'cash',
    cash_received_khr INTEGER DEFAULT NULL,
    cash_received_usd DECIMAL(12,2) DEFAULT NULL,
    change_given_khr INTEGER DEFAULT NULL,
    change_given_usd DECIMAL(12,2) DEFAULT NULL,
    
    -- Fulfillment
    fulfillment_status VARCHAR(20) CHECK (fulfillment_status IN ('in_prep', 'ready', 'delivered', 'cancelled')) DEFAULT 'in_prep',
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finalized_at TIMESTAMPTZ DEFAULT NULL,
    in_prep_at TIMESTAMPTZ DEFAULT NULL,
    ready_at TIMESTAMPTZ DEFAULT NULL,
    delivered_at TIMESTAMPTZ DEFAULT NULL,
    cancelled_at TIMESTAMPTZ DEFAULT NULL
);

-- Sale items table
CREATE TABLE IF NOT EXISTS sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL,
    
    -- Snapshots
    menu_item_name VARCHAR(255) NOT NULL,
    unit_price_usd DECIMAL(10,2) NOT NULL,
    unit_price_khr_exact INTEGER NOT NULL,
    modifiers JSONB DEFAULT '[]',
    
    -- Quantities and totals
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    line_total_usd_exact DECIMAL(12,2) NOT NULL,
    line_total_khr_exact INTEGER NOT NULL,
    
    -- Line discounts
    line_discount_type VARCHAR(20) CHECK (line_discount_type IN ('percentage', 'fixed')),
    line_discount_amount DECIMAL(10,2) DEFAULT 0,
    line_applied_policy_id UUID DEFAULT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sales audit log
CREATE TABLE IF NOT EXISTS sales_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
    actor_id UUID NOT NULL REFERENCES employees(id),
    action VARCHAR(50) NOT NULL CHECK (action IN (
        'create_draft', 'finalize', 'void', 'reopen', 
        'set_ready', 'set_delivered', 'revert_fulfillment'
    )),
    reason TEXT,
    old_values JSONB DEFAULT NULL,
    new_values JSONB DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for sales tables
CREATE INDEX IF NOT EXISTS idx_sales_tenant_branch ON sales(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_state ON sales(state);
CREATE INDEX IF NOT EXISTS idx_sales_fulfillment_status ON sales(fulfillment_status);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_finalized_at ON sales(finalized_at);
CREATE INDEX IF NOT EXISTS idx_sales_client_uuid ON sales(client_uuid);
CREATE INDEX IF NOT EXISTS idx_sales_employee_id ON sales(employee_id);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_menu_item_id ON sale_items(menu_item_id);

CREATE INDEX IF NOT EXISTS idx_sales_audit_sale_id ON sales_audit_log(sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_audit_tenant_branch ON sales_audit_log(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_audit_created_at ON sales_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_audit_actor ON sales_audit_log(actor_id);

-- Partial indexes for performance
CREATE INDEX IF NOT EXISTS idx_sales_active ON sales(tenant_id, branch_id) 
WHERE state = 'finalized' AND fulfillment_status IN ('in_prep', 'ready');

-- ============================================
-- DISCOUNT POLICIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS discount_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('per_item', 'per_branch')),
    value_type VARCHAR(20) NOT NULL CHECK (value_type IN ('percentage', 'fixed')),
    value DECIMAL(10,2) NOT NULL CHECK (value >= 0),
    scope_branches JSONB DEFAULT '[]', -- Array of branch IDs
    target_item_ids JSONB DEFAULT '[]', -- Array of menu item IDs (for per_item type)
    starts_at TIMESTAMPTZ DEFAULT NULL,
    ends_at TIMESTAMPTZ DEFAULT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'inactive', 'scheduled')) DEFAULT 'active',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discount_policies_tenant ON discount_policies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_discount_policies_type ON discount_policies(type);
CREATE INDEX IF NOT EXISTS idx_discount_policies_status ON discount_policies(status);

-- ============================================
-- INVENTORY JOURNAL TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_journal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    stock_item_id UUID NOT NULL,  -- References menu items or stock items
    delta INTEGER NOT NULL,  -- Negative for sale, positive for void/reopen
    reason VARCHAR(50) NOT NULL CHECK (reason IN ('sale', 'void', 'reopen', 'adjustment')),
    ref_sale_id UUID DEFAULT NULL REFERENCES sales(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_journal_branch ON inventory_journal(branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_journal_stock_item ON inventory_journal(stock_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_journal_sale ON inventory_journal(ref_sale_id);
CREATE INDEX IF NOT EXISTS idx_inventory_journal_created_at ON inventory_journal(created_at);

-- ============================================
-- SEED TEST DATA FOR SALES
-- ============================================

-- Insert sample completed sales
INSERT INTO sales (
    id, client_uuid, tenant_id, branch_id, employee_id,
    sale_type, state, vat_enabled, vat_rate, vat_amount_usd, vat_amount_khr_exact,
    fx_rate_used, total_usd_exact, total_khr_exact,
    tender_currency, payment_method, fulfillment_status,
    finalized_at, created_at
) VALUES 
-- Sale 1: 2 items, take away, delivered
(
    '990e8400-e29b-41d4-a716-446655440001',
    '110e8400-e29b-41d4-a716-446655440001',
    '550e8400-e29b-41d4-a716-446655440000',
    '660e8400-e29b-41d4-a716-446655440000',
    '770e8400-e29b-41d4-a716-446655440012',
    'take_away', 'finalized', TRUE, 0.1000, 0.60, 2460,
    4100.00, 6.60, 27060,
    'USD', 'cash', 'delivered',
    NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours'
),
-- Sale 2: 2 items, dine in, delivered
(
    '990e8400-e29b-41d4-a716-446655440002',
    '110e8400-e29b-41d4-a716-446655440002',
    '550e8400-e29b-41d4-a716-446655440000',
    '660e8400-e29b-41d4-a716-446655440000',
    '770e8400-e29b-41d4-a716-446655440012',
    'dine_in', 'finalized', TRUE, 0.1000, 1.25, 5125,
    4100.00, 13.75, 56375,
    'KHR', 'cash', 'delivered',
    NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour'
),
-- Sale 3: 2 items, dine in, in progress
(
    '990e8400-e29b-41d4-a716-446655440003',
    '110e8400-e29b-41d4-a716-446655440003',
    '550e8400-e29b-41d4-a716-446655440000',
    '660e8400-e29b-41d4-a716-446655440000',
    '770e8400-e29b-41d4-a716-446655440012',
    'dine_in', 'finalized', TRUE, 0.1000, 1.18, 4838,
    4100.00, 12.93, 53013,
    'USD', 'cash', 'in_prep',
    NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '10 minutes'
)
ON CONFLICT (id) DO NOTHING;

-- Insert sale items (uses menu_item_id as UUID strings)
INSERT INTO sale_items (
    id, sale_id, menu_item_id, menu_item_name,
    unit_price_usd, unit_price_khr_exact,
    quantity, line_total_usd_exact, line_total_khr_exact
) VALUES 
-- Sale 1 items
('aa0e8400-e29b-41d4-a716-446655440001', '990e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440001', 'Espresso', 2.50, 10250, 1, 2.50, 10250),
('aa0e8400-e29b-41d4-a716-446655440002', '990e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440004', 'Croissant', 3.50, 14350, 1, 3.50, 14350),
-- Sale 2 items
('aa0e8400-e29b-41d4-a716-446655440003', '990e8400-e29b-41d4-a716-446655440002', '880e8400-e29b-41d4-a716-446655440003', 'Latte', 4.00, 16400, 1, 4.00, 16400),
('aa0e8400-e29b-41d4-a716-446655440004', '990e8400-e29b-41d4-a716-446655440002', '880e8400-e29b-41d4-a716-446655440006', 'Caesar Salad', 8.50, 34850, 1, 8.50, 34850),
-- Sale 3 items
('aa0e8400-e29b-41d4-a716-446655440005', '990e8400-e29b-41d4-a716-446655440003', '880e8400-e29b-41d4-a716-446655440007', 'Club Sandwich', 9.75, 39975, 1, 9.75, 39975),
('aa0e8400-e29b-41d4-a716-446655440006', '990e8400-e29b-41d4-a716-446655440003', '880e8400-e29b-41d4-a716-446655440008', 'Iced Tea', 2.00, 8200, 1, 2.00, 8200)
ON CONFLICT (id) DO NOTHING;

-- Insert audit log entries
INSERT INTO sales_audit_log (tenant_id, branch_id, sale_id, actor_id, action) VALUES 
('550e8400-e29b-41d4-a716-446655440000', '660e8400-e29b-41d4-a716-446655440000', '990e8400-e29b-41d4-a716-446655440001', '770e8400-e29b-41d4-a716-446655440012', 'create_draft'),
('550e8400-e29b-41d4-a716-446655440000', '660e8400-e29b-41d4-a716-446655440000', '990e8400-e29b-41d4-a716-446655440001', '770e8400-e29b-41d4-a716-446655440012', 'finalize'),
('550e8400-e29b-41d4-a716-446655440000', '660e8400-e29b-41d4-a716-446655440000', '990e8400-e29b-41d4-a716-446655440001', '770e8400-e29b-41d4-a716-446655440012', 'set_delivered'),
('550e8400-e29b-41d4-a716-446655440000', '660e8400-e29b-41d4-a716-446655440000', '990e8400-e29b-41d4-a716-446655440002', '770e8400-e29b-41d4-a716-446655440012', 'create_draft'),
('550e8400-e29b-41d4-a716-446655440000', '660e8400-e29b-41d4-a716-446655440000', '990e8400-e29b-41d4-a716-446655440002', '770e8400-e29b-41d4-a716-446655440012', 'finalize'),
('550e8400-e29b-41d4-a716-446655440000', '660e8400-e29b-41d4-a716-446655440000', '990e8400-e29b-41d4-a716-446655440002', '770e8400-e29b-41d4-a716-446655440012', 'set_delivered'),
('550e8400-e29b-41d4-a716-446655440000', '660e8400-e29b-41d4-a716-446655440000', '990e8400-e29b-41d4-a716-446655440003', '770e8400-e29b-41d4-a716-446655440012', 'create_draft'),
('550e8400-e29b-41d4-a716-446655440000', '660e8400-e29b-41d4-a716-446655440000', '990e8400-e29b-41d4-a716-446655440003', '770e8400-e29b-41d4-a716-446655440012', 'finalize')
ON CONFLICT (id) DO NOTHING;