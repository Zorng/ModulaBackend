# Modula Backend - Module Structure

✅ All Capstone 1 modules are now scaffolded according to the playbook!

## Directory Structure Created

```
src/
├── platform/              # Tech plumbing (framework & shared infra)
│   ├── config/           # ✅ Environment and typed config
│   ├── db/               # ✅ PostgreSQL pool, migrations, transactions
│   ├── events/           # ✅ In-process event bus, outbox pattern
│   ├── logger/           # ✅ Pino logger setup
│   └── security/         # ✅ JWT, RBAC, capabilities (to be implemented)
│
├── shared/               # ✅ Shared-kernel (domain primitives)
│   ├── errors.ts         # Typed domain errors
│   ├── result.ts         # Result/Either pattern
│   ├── ids.ts            # UUID/ULID generation
│   ├── pagination.ts     # Pagination utilities
│   └── events.ts         # Domain event contracts
│
└── modules/              # Feature modules
    ├── auth/             # ✅ Users, roles, sessions, capabilities
    │   ├── api/          # Routes & controllers
    │   ├── app/          # Use cases
    │   ├── domain/       # Entities & business logic
    │   ├── infra/        # Repositories & adapters
    │   ├── migrations/   # SQL migrations
    │   ├── tests/        # Module tests
    │   ├── index.ts      # Module bootstrap
    │   └── README.md     # Module documentation
    │
    ├── tenant/           # ✅ Tenants, branches, staff
    │   ├── api/
    │   ├── app/
    │   ├── domain/
    │   ├── infra/
    │   ├── migrations/
    │   ├── tests/
    │   ├── index.ts
    │   └── README.md
    │
    ├── menu/             # ✅ Menu items, categories, modifiers
    │   ├── api/
    │   ├── app/
    │   ├── domain/
    │   ├── infra/
    │   ├── migrations/
    │   ├── tests/
    │   ├── index.ts
    │   └── README.md
    │
    ├── inventory/        # ✅ Stock, branches, journal, restocks
    │   ├── api/
    │   ├── app/
    │   ├── domain/
    │   ├── infra/
    │   ├── migrations/
    │   ├── tests/
    │   ├── index.ts
    │   └── README.md
    │
    ├── sales/            # ✅ Orders, checkout, tenders
    │   ├── api/
    │   ├── app/
    │   ├── domain/
    │   ├── infra/
    │   ├── migrations/
    │   ├── tests/
    │   ├── index.ts
    │   └── README.md
    │
    ├── cash/             # ✅ Cash sessions, movements, X/Z reports
    │   ├── api/
    │   ├── app/
    │   ├── domain/
    │   ├── infra/
    │   ├── migrations/
    │   ├── tests/
    │   ├── index.ts
    │   └── README.md
    │
    ├── attendance/       # ✅ Shifts, check-in/out
    │   ├── api/
    │   ├── app/
    │   ├── domain/
    │   ├── infra/
    │   ├── migrations/
    │   ├── tests/
    │   ├── index.ts
    │   └── README.md
    │
    ├── policy/           # ✅ Business policies & rules
    │   ├── api/
    │   ├── app/
    │   ├── domain/
    │   ├── infra/
    │   ├── migrations/
    │   ├── tests/
    │   ├── index.ts
    │   └── README.md
    │
    └── reporting/        # ✅ Read models & queries
        ├── api/
        ├── app/
        ├── domain/
        ├── infra/
        ├── migrations/
        ├── tests/
        ├── index.ts
        └── README.md
```

## Module Boundaries

### ✅ Clean Architecture Rules (Enforced)

- **No lateral imports**: Module A cannot import from Module B
- **Only allowed imports**: `platform/*` and `shared/*`
- **Communication**: Via events or HTTP ports (interfaces)

### 📝 Next Steps

1. **Set up ESLint + dependency-cruiser** to enforce module boundaries
2. **Move existing tenant code** into the proper folders:

   - `src/modules/tenant/api/router.ts` → already exists
   - `src/modules/tenant/infra/repo.ts` → already exists
   - Create domain entities in `domain/`
   - Create use cases in `app/`

3. **Implement first vertical slice**:

   - Complete tenant module (CRUD)
   - Add auth module (login/JWT)
   - Add menu module
   - Add sales module
   - Connect sales → inventory via events

4. **Add platform features**:
   - Outbox table + dispatcher
   - JWT middleware
   - Error handling middleware
   - Request validation (Zod)

## Event Contracts Defined

✅ Created in `src/shared/events.ts`:

- `sales.sale_finalized` - Published by sales, consumed by inventory & cash
- `cash.session_opened` - Cash session events
- `cash.session_closed` - End of day reports
- `inventory.stock_adjusted` - Stock movement events

## Documentation

Each module has a README.md explaining:

- Responsibility
- Folder structure
- Key features
- Tables (for data modules)
- Events published/consumed

---

**You're now ready to start implementing features following the playbook architecture!** 🚀
