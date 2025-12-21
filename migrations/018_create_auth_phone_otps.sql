-- Phone OTPs for registration + credential recovery
-- Idempotent: safe to run multiple times

CREATE TABLE IF NOT EXISTS auth_phone_otps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) NOT NULL,
    purpose VARCHAR(50) NOT NULL,
    code_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auth_phone_otps_phone_purpose_created
    ON auth_phone_otps(phone, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_phone_otps_expires_at
    ON auth_phone_otps(expires_at);

