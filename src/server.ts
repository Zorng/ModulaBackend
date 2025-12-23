// src/server.ts
import express from "express";
import cors from "cors";
import { ping } from "#db";
import { log } from "#logger";
import { bootstrapTenantModule } from "#modules/tenant/index.js";
import { bootstrapBranchModule } from "#modules/branch/index.js";
import { bootstrapAuditModule } from "#modules/audit/index.js";
import { createMenuRouter } from "./modules/menu/api/router/index.js";
import { createPolicyRouter } from "./modules/policy/index.js";
import { PgPolicyRepository } from "./modules/policy/infra/repository.js";
import {
  errorHandler,
  notFoundHandler,
} from "./platform/http/middleware/error-handler.js";
import { setupSwagger } from "./platform/http/swagger.js";
import { createImageStorageAdapter } from "#modules/menu/infra/repositories/imageAdapter.js";
import { eventBus } from "./platform/events/index.js";
import { startOutboxDispatcher } from "./platform/events/outbox.js";
import { bootstrapSalesModule } from "./modules/sales/index.js";
import { bootstrapInventoryModule } from "./modules/inventory/index.js";
import { bootstrapCashModule } from "./modules/cash/index.js";
import { bootstrapOfflineSyncModule } from "#modules/offlineSync/index.js";
import { pool } from "./platform/db/index.js";
import { TransactionManager } from "./platform/db/transactionManager.js";
import {
  createMembershipProvisioningPort,
  setupAuthModule,
} from "./modules/auth/index.js";
import { imageProxyRouter } from "./platform/http/routes/image-proxy.js";
import { bootstrapAccountSettingsModule } from "./modules/accountSettings/index.js";
import { bootstrapStaffManagementModule } from "./modules/staffManagement/index.js";

const app = express();
// Enable CORS for all origins (customize as needed for production)
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Tenant-Id"],
  })
);

app.use(express.json());

// Serve uploaded images statically
app.use("/uploads", express.static("public/uploads"));

// Setup Swagger documentation
setupSwagger(app);

// ==================== Initialize Core Infrastructure ====================

// Initialize transaction manager
const transactionManager = new TransactionManager();

// Start outbox dispatcher for reliable event delivery
startOutboxDispatcher(pool, 1000); // Poll every 1 second
log.info("✓ Outbox dispatcher started - reliable event delivery enabled");

// ==================== Bootstrap Modules ====================

const policyRepo = new PgPolicyRepository(pool);

// Setup Audit Module (admin read + shared ports)
const auditModule = bootstrapAuditModule(pool);

const staffManagementModule = bootstrapStaffManagementModule(pool, {
  auditWriterPort: auditModule.auditWriterPort,
});

// Setup Branch Module (profile + lifecycle + provisioning ports)
const branchModule = bootstrapBranchModule(pool, {
  auditWriterPort: auditModule.auditWriterPort,
});

// Setup Tenant Module (provisioning + admin-only business profile endpoints)
const membershipProvisioningPort = createMembershipProvisioningPort();
const tenantModule = bootstrapTenantModule(pool, {
  membershipProvisioningPort,
  branchProvisioningPort: branchModule.branchProvisioningPort,
  policyDefaultsPort: {
    ensureDefaultPolicies: async (tenantId: string) => {
      await policyRepo.ensureDefaultPolicies(tenantId);
    },
  },
  auditWriterPort: auditModule.auditWriterPort,
});

// Setup Auth Module
const authModule = setupAuthModule(pool, {
  invitationPort: staffManagementModule.invitationPort,
  tenantProvisioningPort: tenantModule.tenantProvisioningPort,
  auditWriterPort: auditModule.auditWriterPort,
});
const { authRoutes, authMiddleware } = authModule;
const staffManagementAuthRouter = staffManagementModule.createRouter(authMiddleware);
const tenantRouter = tenantModule.createRouter(authMiddleware);
const branchRouter = branchModule.createRouter(authMiddleware);
const auditRouter = auditModule.createRouter(authMiddleware);

// Setup Policy Router (requires auth middleware)
const policyRouter = createPolicyRouter(authMiddleware);

// Setup Menu Router (requires auth middleware)
const menuRouter = createMenuRouter(authMiddleware);

// Setup Account Settings Module (display name, etc.)
const accountSettingsModule = bootstrapAccountSettingsModule(pool, authMiddleware);
const { router: accountSettingsRouter } = accountSettingsModule;

// Setup Sales Module
const salesModule = bootstrapSalesModule(
  pool,
  transactionManager,
  authMiddleware,
  { auditWriterPort: auditModule.auditWriterPort }
);
const { router: salesRouter } = salesModule;

// Setup image storage (shared across modules)
const imageStorage = createImageStorageAdapter();

// Setup Inventory Module
const inventoryModule = bootstrapInventoryModule(
  pool,
  authMiddleware,
  imageStorage,
  { auditWriterPort: auditModule.auditWriterPort }
);
const { router: inventoryRouter, eventHandlers: inventoryEventHandlers } =
  inventoryModule;

// Setup Cash Module
const cashModule = bootstrapCashModule(pool, authMiddleware, {
  auditWriterPort: auditModule.auditWriterPort,
});
const { router: cashRouter, eventHandlers: cashEventHandlers } = cashModule;

// Setup Offline Sync Module (apply queued offline operations)
const offlineSyncModule = bootstrapOfflineSyncModule(
  pool,
  transactionManager,
  authMiddleware,
  {
    branchGuardPort: branchModule.branchGuardPort,
    auditWriterPort: auditModule.auditWriterPort,
  }
);
const { router: offlineSyncRouter } = offlineSyncModule;

// ==================== Register Event Handlers ====================

// Subscribe inventory module to sales events
eventBus.subscribe("sales.sale_finalized", async (event) => {
  try {
    await inventoryEventHandlers.saleFinalizedHandler.handle(event as any);
  } catch (error) {
    log.error("Failed to handle sales.sale_finalized event:", error);
    throw error; // Re-throw to trigger retry via outbox
  }
});

eventBus.subscribe("sales.sale_voided", async (event) => {
  try {
    await inventoryEventHandlers.saleVoidedHandler.handle(event as any);
  } catch (error) {
    log.error("Failed to handle sales.sale_voided event:", error);
    throw error; // Re-throw to trigger retry via outbox
  }
});

eventBus.subscribe("sales.sale_reopened", async (event) => {
  try {
    await inventoryEventHandlers.saleReopenedHandler.handle(event as any);
  } catch (error) {
    log.error("Failed to handle sales.sale_reopened event:", error);
    throw error; // Re-throw to trigger retry via outbox
  }
});

log.info("✓ Inventory event handlers registered");

// Subscribe cash module to sales events
eventBus.subscribe("sales.sale_finalized", async (event) => {
  try {
    await cashEventHandlers.saleFinalizedHandler.handle(event as any);
  } catch (error) {
    log.error(
      "Failed to handle sales.sale_finalized event in cash module:",
      error
    );
    throw error; // Re-throw to trigger retry via outbox
  }
});

eventBus.subscribe("sales.sale_voided", async (event) => {
  try {
    await cashEventHandlers.saleVoidedHandler.handle(event as any);
  } catch (error) {
    log.error(
      "Failed to handle sales.sale_voided event in cash module:",
      error
    );
    throw error; // Re-throw to trigger retry via outbox
  }
});

log.info("✓ Cash event handlers registered");

// ==================== Register Routes ====================

app.get("/health", async (_req, res) => {
  const now = await ping();
  res.json({ status: "ok", time: now });
});

app.locals.imageStorage = imageStorage;
app.locals.tenantMetadataPort = tenantModule.tenantMetadataPort;
app.locals.branchGuardPort = branchModule.branchGuardPort;
app.locals.branchQueryPort = branchModule.branchQueryPort;
app.locals.auditWriterPort = auditModule.auditWriterPort;
app.locals.auditQueryPort = auditModule.auditQueryPort;

// Swagger UI setup - must be before routes
setupSwagger(app);

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: |
 *       Returns the health status of the API server and database connection.
 *
 *       **Use cases:**
 *       - Monitor server availability
 *       - Check database connectivity
 *       - Verify API is responding
 *     tags:
 *       - Health
 *     security: []
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [ok]
 *                   description: Health status
 *                 time:
 *                   type: string
 *                   format: date-time
 *                   description: Current server time (from database)
 *                 version:
 *                   type: string
 *                   description: API version
 *                 uptime:
 *                   type: number
 *                   description: Server uptime in seconds
 *             example:
 *               status: "ok"
 *               time: "2025-01-15T10:30:45.123Z"
 *               version: "1.0.0"
 *               uptime: 3600
 *       500:
 *         description: Server or database error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [error]
 *                 error:
 *                   type: string
 *             example:
 *               status: "error"
 *               error: "Database connection failed"
 */
app.get("/health", async (_req, res) => {
  try {
    const now = await ping();
    res.json({
      status: "ok",
      time: now,
      version: "1.0.0",
      uptime: process.uptime(),
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Mount module routers
app.use("/v1/tenants", tenantRouter);
app.use("/v1/branches", branchRouter);
app.use("/v1/audit", auditRouter);
app.use("/v1/auth", authRoutes);
app.use("/v1/auth", staffManagementAuthRouter);
app.use("/v1/account", accountSettingsRouter);
app.use(menuRouter); // Menu routes already include /v1/menu prefix
app.use("/v1/sales", salesRouter);
app.use("/v1/inventory", inventoryRouter);
app.use("/v1/cash", cashRouter);
app.use("/v1/policies", policyRouter);
app.use("/v1/sync", offlineSyncRouter);
app.use("/v1", imageProxyRouter); // Image proxy for CORS-free access

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  log.info(`🚀 Server running on http://localhost:${PORT}`);
  log.info(`📚 API docs available at http://localhost:${PORT}/api-docs`);
  log.info(`📄 OpenAPI spec at http://localhost:${PORT}/openapi.json`);
});
