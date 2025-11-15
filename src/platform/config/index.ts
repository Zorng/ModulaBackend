import dotenvFlow from 'dotenv-flow';
dotenvFlow.config({ node_env: process.env.NODE_ENV || 'development' });

// (optional but recommended) validate presence so it fails fast
// Skip validation in test environment to allow mocking
const isTestEnv = process.env.NODE_ENV === 'test';

if (!isTestEnv && !process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing. Add it to .env.local at project root.');
}

if (!isTestEnv && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is missing. Add it to .env.local at project root.');
}

if (!isTestEnv && !process.env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_REFRESH_SECRET is missing. Add it to .env.local at project root.');
}

export const config = {
    jwt: {
        secret: process.env.JWT_SECRET || 'test-secret',
        refreshSecret: process.env.JWT_REFRESH_SECRET || 'test-refresh-secret',
        accessTokenExpiry: process.env.JWT_ACCESS_TOKEN_EXPIRY || '12h',
        refreshTokenExpiry: process.env.JWT_REFRESH_TOKEN_EXPIRY || '7d'
    },
    auth: {
        defaultInviteExpiryHours: parseInt(process.env.DEFAULT_INVITE_EXPIRY_HOURS || '72', 10)
    },
    database: {
        url: process.env.DATABASE_URL || 'postgresql://localhost:5432/modula_test'
    }
};