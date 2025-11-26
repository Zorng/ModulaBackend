# Modula Backend – Modular Architecture Playbook (Capstone → Startup)

**Audience:** Backend engineers working on Modula (F&B-first POS).  
**Goal:** Ship a clean **modular monolith** now, with seams to split into microservices later—without rewrite.  
**Stack assumptions:** Node.js + TypeScript (ESM), Express (or Fastify), Postgres, Zod for schema validation.

---

## 1) Why Modular Architecture for Modula
- **Independent feature velocity:** auth, sales, inventory, cash, attendance, policy, reporting, billing each evolve on their own cadence.
- **Team autonomy:** code ownership and review lanes per module.
- **Runtime safety:** one deployable (capstone-friendly), but **hard boundaries** (no cross-imports) to keep coupling low.
- **Scale path:** in-process events now; message broker later. “Lift & shift” a module into a service by swapping the bus.

**Definition we use:**
- **Modular Monolith:** single process repo with **feature modules** that own their domain: API, domain logic, infra, migrations, and tests. Modules communicate via **contracts** (HTTP handlers & events), not source-level imports.

---

## 2) Module Map (Capstone 1 → 2)
**Capstone 1 (must-have):**
- `auth` – users, roles, sessions, capabilities
- `tenant` – tenants, branches, staff seats
- `menu` – menu items, categories, modifiers, menu↔stock map
- `inventory` – stock_item, branch_stock, restock_batches, inventory_journal
- `sales` – order/cart, pre-checkout, tenders, rounding, status
- `cash` – cash sessions, movements, X/Z reports
- `attendance` – shifts, check-in/out (GPS policy in Phase 2)
- `policy` – sale/inventory/cash/attendance policies
- `reporting` – read models & queries (no business writes)

**Capstone 2 (later):**
- `billing` – plans, subscriptions, invoices, payments
- `alerts` – anomaly detection, notifications

Each module **owns its tables** and exposes APIs + events.

---

## 3) Repository & Directory Layout
```
/src
  /platform                 # tech plumbing (framework & shared infra)
    db/                     # pg pool, migrations runner, trx helpers
    http/                   # express app factory, middlewares
    events/                 # in-process event bus, outbox dispatcher
    security/               # JWT, RBAC, capabilities guard
    config/                 # env, typed config
    logger/                 # pino/winston setup
  /shared                   # shared-kernel (never import module code here)
    errors.ts               # typed errors (DomainError, NotFound, etc.)
    result.ts               # Result/Either helpers
    ids.ts                  # ULIDs/UUIDs utils
    pagination.ts
  /modules
    /auth
      api/                  # routers/controllers (DTO in/out)
      app/                  # use-cases (ports)
      domain/               # entities, rules, policies (pure TS)
      infra/                # repos, sql, cache, adapters
      migrations/           # SQL files for this module only
      tests/
      index.ts              # module bootstrap (register routes, handlers)
    /inventory
      api/ app/ domain/ infra/ migrations/ tests/ index.ts
    /sales
      api/ app/ domain/ infra/ migrations/ tests/ index.ts
    /cash
      ...
    /attendance
      ...
    /policy
      ...
    /reporting
      ...
  server.ts                 # wire platform + modules
```

**Rules:**
- **No lateral imports**: `module A` cannot import from `module B` folders. Use events/HTTP ports.
- Only `platform/` and `shared/` may be imported by modules.
- Enforce with **eslint** + **dependency-cruiser**.

---

## 4) Communication Patterns
### 4.1 Synchronous (HTTP/Handler)
Use for request/response flows and read queries.
- Example: `sales` handler calls `policy` **service port** to resolve VAT/discount.
- Implement as **interfaces** in `app/` with adapters in `infra/` to avoid direct imports.

### 4.2 Asynchronous (Domain Events)
Use for side-effects and decoupling.
- In Capstone 1: **in-process bus** + **outbox table** for reliability.
- In Capstone 2+: swap to NATS/Kafka; same contracts.

**Event contract sample (shared/events.ts):**
```ts
export type SaleFinalizedV1 = {
  type: 'sales.sale_finalized';
  v: 1;
  tenantId: string;
  branchId: string;
  saleId: string;
  lines: Array<{ menuItemId: string; qty: number }>;
  tenders: Array<{ method: 'CASH'|'QR'; amountUsd: number; amountKhr: number }>;
  finalizedAt: string; // ISO
};
```
**Publish (in the same DB transaction as the write):**
- Write business row(s)
- Append to `outbox` with serialized event
- Commit → background dispatcher reads `outbox`, delivers to bus, marks sent

**Subscribers:**
- `inventory` subscribes to `sales.sale_finalized` → deduct per `menu_stock_map`
- `reporting` subscribes to `cash.session_closed` → aggregate daily cash

---

## 5) Data Ownership & Postgres Strategy
- **One database**, tables **owned by a module** (prefix or separate schema).
- Prefer **IDs over cross-module foreign keys** on hot paths; keep **tenant_id** everywhere for RLS.
- Use **append-only journals** for critical histories (inventory_journal, activity_log, cash_movements).
- Reporting uses **views/materialized views**; no business writes in `reporting`.

### Table naming (examples)
- `auth.users`, `tenant.branches`, `menu.items`, `inventory.stock_item`, `inventory.branch_stock`, `inventory.restock_batches`, `sales.sales`, `cash.cash_sessions` …

### Multi-tenancy
- Every row carries `tenant_id`.  
- Optional **Postgres RLS** per tenant in production.

---

## 6) Migrations (Per-Module)
- Each module keeps its own SQL migration files in `/migrations` with timestamps.
- **CI runner** composes all migrations in chronological order and applies to test DB.
- Follow **expand → migrate → contract**:
  1) Add new columns/tables (nullable/defaults)
  2) Backfill in batches
  3) Switch code to use new shape
  4) Drop old columns (in a later deploy)

**Developer workflow:**
- `pnpm db:migrate` – apply all
- `pnpm db:generate <module> <desc>` – scaffold timestamped SQL in that module

---

## 7) Coding Conventions
- **Type-safe DTOs** with Zod: validate at API boundary.
- **Use-cases** in `app/` are the only entry-points to domain logic.
- **Domain** is pure TS: no HTTP/DB imports.
- **Infra** implements repositories with parameterized SQL and transaction helpers.
- **Errors:** throw `DomainError`/`Forbidden`/`Conflict`; map to 4xx/5xx centrally.
- **Idempotency:** mutation endpoints accept `Idempotency-Key` header.
- **Pagination:** `?cursor=&limit=`; return `{ data, nextCursor }`.

---

## 8) Example Flow (End-to-End)
**Scenario:** Finalize sale → inventory deduction
1) `sales.api` POST `/sales/{id}/finalize` validates DTO (Zod)
2) `sales.app.FinalizeSale` loads cart, applies policy (VAT/discount)
3) Persist sale + lines + tenders in a **single transaction**
4) Publish `sales.sale_finalized` to **outbox** in same transaction
5) **Dispatcher** reads outbox → emits event to in-process bus
6) `inventory.app.OnSaleFinalized` handler:
   - For each line, read `menu_stock_map`
   - Write **inventory_journal** rows (SALE, negative deltas in base UOM)
   - Update **branch_stock.on_hand −= qty** (guard allow_negative)
   - Commit

**No module imports another**; only contracts are shared.

---

## 9) API Style Guide
- **Routing:** `/v1/{module}/...` (e.g., `/v1/sales/...`)
- **Errors:** JSON with `code`, `message`, optional `details`
- **Auth:** Bearer JWT; middleware resolves `tenantId`, `userId`, `roles`, `capabilities`
- **RBAC + Capabilities:** route guards check both role + feature flag (e.g., multi-branch)
- **Idempotency:** accept `Idempotency-Key` for all POST/PUT that mutate state

**Example (Cash Sessions)**
```
POST /v1/cash/sessions/open
POST /v1/cash/sessions/{id}/close
POST /v1/cash/sessions/{id}/paid-out
GET  /v1/cash/sessions/{id}/z
```

---

## 10) Capabilities & Feature Flags (Multi-Tenant UX)
- `auth` exposes `getCapabilities(tenantId)` → `{ features: { base_pos, multi_branch, attendance }, limits: { max_branches, default_staff_slots } }`
- Middleware injects `req.capabilities`; routers/handlers honor it.
- UI reads same JSON to **render per-tenant UX** (single build, runtime-configured).

---

## 11) Testing Strategy
- **Unit tests**: domain logic (pure TS)
- **Use-case tests**: with in-memory repos or test DB
- **Contract tests**: publish → subscribe event payloads (schema-validated)
- **API tests**: supertest against module routers
- **Migration tests**: boot ephemeral Postgres, apply migrations, smoke queries

---

## 12) Observability & Ops
- **Logging:** per-module logger namespace; include `tenantId`, `branchId`, `actorId`
- **Audit:** activity_log append-only for sensitive actions (open session, paid-out, refund, void sale)
- **Metrics:** counters for sales finalized, inventory deductions, paid-outs, errors
- **Tracing (optional):** OpenTelemetry IDs through request → event → subscriber

---

## 13) Security Essentials
- JWT with short TTL + refresh; role + branch scope in claims
- Strict input validation (Zod) and output shaping
- Rate limits on mutation routes (per user + per tenant)
- Postgres least-privilege roles; parameterized SQL only
- Secrets via environment + runtime config; no secrets in repo

---

## 14) Adding a New Module (Checklist)
1) Create `/modules/<name>/{api,app,domain,infra,migrations,tests}`
2) Define **domain model** and invariants
3) Design **API DTOs** (Zod) & routes
4) Define **events** published/consumed (versioned types)
5) Create tables + migrations (tenant_id included)
6) Implement repositories & use-cases
7) Wire routes in `index.ts` and register in `server.ts`
8) Add unit, API, and contract tests
9) Document feature flags/capabilities if needed

---

## 15) Minimal Code Skeletons
**Use-case (port & service)**
```ts
// modules/sales/app/finalize-sale.ts
export interface PolicyPort { getSalePolicy(tenantId: string): Promise<SalePolicy>; }
export interface SaleRepo { save(sale: Sale, trx: Trx): Promise<void>; }
export interface EventBus { publish(evt: unknown, trx: Trx): Promise<void>; }

export class FinalizeSale {
  constructor(private repo: SaleRepo, private policy: PolicyPort, private bus: EventBus) {}
  async exec(cmd: { tenantId: string; saleId: string; actorId: string }) {
    return withTrx(async (trx) => {
      const pol = await this.policy.getSalePolicy(cmd.tenantId);
      const sale = await loadSale(cmd.saleId, trx).finalize(pol, cmd.actorId);
      await this.repo.save(sale, trx);
      await this.bus.publish(toSaleFinalizedEvent(sale), trx);
      return sale.id;
    });
  }
}
```

**Event subscriber**
```ts
// modules/inventory/app/on-sale-finalized.ts
export const onSaleFinalized = makeHandler('sales.sale_finalized', async (evt, deps) => {
  await withTrx(async (trx) => {
    for (const line of evt.lines) {
      const ingredients = await deps.recipeRepo.getForMenuItem(line.menuItemId, trx);
      for (const ing of ingredients) {
        const qty = ing.quantityPerUnit * line.qty; // base UOM
        await deps.journalRepo.appendSale(evt.tenantId, evt.branchId, ing.stockItemId, -qty, evt.saleId, trx);
        await deps.stockRepo.decrement(evt.tenantId, evt.branchId, ing.stockItemId, qty, trx);
      }
    }
  });
});
```

**Outbox table (platform/db)**
```sql
CREATE TABLE platform_outbox (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);
```

---

## 16) Database Patterns (Inventory Excerpts)
- `inventory.stock_item` – defines items (uom_base, trackable, is_ingredient/is_sellable)
- `inventory.branch_stock` – live balance per branch (on_hand, reserved)
- `inventory.inventory_journal` – immutable movements (SALE/RESTOCK/…)
- `inventory.menu_stock_map` – recipe mapping (menu → stock)
- `inventory.restock_batches` + `restock_batch_items` – deliveries with expiry/lot/cost

**Invariant:** For a given (tenant, branch, stock_item),
`opening + Σ(journal.quantity_delta_base) = branch_stock.on_hand` (over a window).

---

## 17) Deployment & Environments
- **Configs per env** (dev/stage/prod): DB URL, JWT keys, CORS origins, feature flags
- **Migrations gate**: app boots only if migrations are at head
- **Blue/green or rolling**: ensure zero-downtime `expand→migrate→contract`

---

## 18) FAQ
**Q: Why not microservices now?**  
A: Capstone timeline, team size, and rapid iteration. We design seams so you can split later without refactor.

**Q: Can modules query each other’s tables?**  
A: Avoid it. If necessary for read-only aggregation, do it in `reporting` (views/materialized views).

**Q: How do we do per-tenant UX differences?**  
A: **Capabilities API** returns feature/limit flags; both backend routes and frontend components honor them.

---

## 19) Onboarding Checklist for New Devs
- [ ] Read this playbook end-to-end
- [ ] Run `pnpm install` and `pnpm dev`
- [ ] Start Postgres (Docker) and run migrations
- [ ] Call a “happy path” e2e: create tenant → add branch → create menu → finalize sale → see inventory deduct
- [ ] Read event contracts in `shared/events.ts`
- [ ] Add a tiny test in any module and run CI locally

---

## 20) Next Steps (Team)
- Lock ESLint + dep-cruiser rules to prevent cross-module imports
- Implement platform **outbox** + **event dispatcher**
- Cut first vertical slice: **Sales finalize → Inventory deduct → Cash session accumulate**
- Add **policy** reads to Sales and **capabilities** guard to routes

---

**Keep the seams clean.** Build a modular monolith now; earn the right to split later. That’s how Modula stays shippable in Capstone and survivable as a startup.

