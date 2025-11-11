import dotenvFlow from 'dotenv-flow';
dotenvFlow.config({ node_env: process.env.NODE_ENV || 'development' });

// (optional but recommended) validate presence so it fails fast
if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing. Add it to .env.local at project root.');
}