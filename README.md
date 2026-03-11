# Modula Backend

A modular, clean architecture backend built with Express, TypeScript, and PostgreSQL.

## Onboarding (Team)

Start here: `onboard/README.md`

Design / business behavior source of truth: `knowledge_base/README.md`

## 🚀 Quick Setup (For Everyone!)

```bash
# 1. Install dependencies
pnpm install

# 2. Run the automated setup wizard
pnpm setup

# 3. Start the server
pnpm dev
```

✅ **Done!** Your backend is running at <http://localhost:3000>

The setup wizard handles everything: environment config, database creation, and migrations.

## 🔧 Environment File Policy

Use two axes:

- `NODE_ENV` = runtime mode (`development`, `test`, `production`)
- `APP_ENV` = resource target (`local`, `staging`, `production`)

File-backed local usage:

- local development resources: `.env.development.local`
- local machine against staging resources: `.env.development.staging.local`
- test resources: `.env.test.local`
- production (if file-based): `.env.production.local`

OTP policy:

- local/test: fixed OTP fallback is enabled by default
- staging: enable fallback explicitly with `V0_AUTH_FIXED_OTP_ENABLED=true`
- production: `V0_AUTH_FIXED_OTP_ENABLED` must remain `false`

`.env.local` is no longer supported and should be removed.

## 📖 API Documentation

**Interactive API docs available at:** <http://localhost:3000/api-docs>

🎯 **For Frontend Developers**: Use Swagger UI to explore and test all API endpoints

- View request/response schemas
- Test endpoints directly in your browser
- See authentication requirements
- Copy cURL commands

See [Auth API Documentation](./src/modules/auth/API_DOCUMENTATION.md) for detailed usage guide.

---

## 📚 Complete Guide

**New to the backend?** Read the complete guide: **[GETTING_STARTED.md](./GETTING_STARTED.md)**

This single comprehensive guide includes:

- ✅ Detailed setup instructions
- ✅ How to add database migrations
- ✅ Common commands and troubleshooting
- ✅ Best practices and examples
- ✅ Quick reference card (printable!)

---

## 📝 Quick Reference

### Adding Database Migrations

1. Create file: `migrations/00X_description.sql`
2. Write your SQL
3. Run: `pnpm migrate`

### Daily Commands

```bash
pnpm dev           # Alias of pnpm dev:local
pnpm dev:local     # Local runtime + local resources
pnpm dev:staging   # Local runtime + staging resources
pnpm migrate       # Alias of pnpm migrate:local
pnpm migrate:local # Migrate local development DB
pnpm migrate:staging # Migrate staging DB from local machine
pnpm migrate:prod  # Migrate production DB
pnpm test          # Run unit tests (fast, DB-free)
pnpm test:integration # Run integration tests (DB-backed)
pnpm test:all      # Run unit + integration
pnpm test:watch    # Run tests in watch mode
```

---

## 🏗️ Project Structure

```text
onboard/               # Team onboarding + parallel dev workflow
knowledge_base/        # Product intent + business logic (authoritative)
_implementation_decisions/ # ADR-style implementation decisions (why/how)
api_contract/          # API contracts for frontend integration
api_contract/_archived/ # Legacy/prototype API contracts (kept for reference only)
migrations/            # SQL migrations + dev seed data
src/
├── modules/           # Feature modules (auth, sales, inventory, etc.)
│   └── [module]/
│       ├── api/       # HTTP routes and controllers
│       ├── app/       # Business logic (use cases, services)
│       ├── domain/    # Domain entities and business rules
│       ├── infra/     # Database repositories
│       └── tests/     # Module tests
├── platform/          # Core infrastructure
│   ├── config/        # Configuration
│   ├── db/            # Database connection and migrations
│   ├── events/        # Event system
│   └── logger/        # Logging
└── shared/            # Shared utilities
    ├── errors.ts      # Error types
    ├── result.ts      # Result type for error handling
    └── ...
```

---

## 📖 Additional Documentation

- `onboard/README.md` - Team onboarding and workflow (start here)
- `knowledge_base/README.md` - Design memory (business logic layering + guidance)
- [GETTING_STARTED.md](./GETTING_STARTED.md) - **Complete setup & migration guide**
- [API Documentation](./src/modules/auth/API_DOCUMENTATION.md) - **Full API documentation with examples**
- [Swagger Quick Start](./src/modules/auth/SWAGGER_QUICK_START.md) - **Quick API testing guide**
- [POSTMAN_TESTING.md](./POSTMAN_TESTING.md) - API testing guide

---

## 🤝 Contributing

1. Create a feature branch from `main`
2. Make your changes
3. Write tests for new features
4. Submit a pull request

---

## ❓ Need Help?

Check [GETTING_STARTED.md](./GETTING_STARTED.md) for:

- Detailed troubleshooting
- Step-by-step setup instructions
- Migration examples
- Best practices

---

## 📄 License

ISC
