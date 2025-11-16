# Modula Backend

A modular, clean architecture backend built with Express, TypeScript, and PostgreSQL.

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
pnpm dev           # Start development server
pnpm migrate       # Run database migrations
pnpm test          # Run all tests
pnpm test:watch    # Run tests in watch mode
```

---

## 🏗️ Project Structure

```text
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

- [GETTING_STARTED.md](./GETTING_STARTED.md) - **Complete setup & migration guide**
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Architecture overview
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
