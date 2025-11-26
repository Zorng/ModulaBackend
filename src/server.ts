import express from 'express';
import cors from 'cors';
import { pool, ping } from '#db';
import { log } from '#logger';
import { tenantRouter } from '#modules/tenant/api/router.js';
import { setupAuthModule } from '#modules/auth/index.js';
import { bootstrapSalesModule } from '#modules/sales/index.js';
import { setupSwagger } from './platform/config/swagger.config.js';
import { EventBus, TransactionManager, OutboxService, OutboxDispatcher } from './platform/events/index.js';
import { setAuthMiddleware } from './platform/security/auth.middleware.js';

const app = express();

// Enable CORS for all origins (customize as needed for production)
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// Setup Swagger documentation
setupSwagger(app);

// ==================== Initialize Core Infrastructure ====================

// Initialize event bus and transaction manager
const eventBus = new EventBus(pool);
const transactionManager = new TransactionManager(pool);

// Initialize outbox pattern for reliable event delivery
const outboxService = new OutboxService(pool);
const outboxDispatcher = new OutboxDispatcher(outboxService, eventBus, 1000); // Poll every 1 second

// Start outbox dispatcher
outboxDispatcher.start();
log.info('✓ Outbox dispatcher started - reliable event delivery enabled');

// ==================== Bootstrap Modules ====================

// Setup Auth Module
const authModule = setupAuthModule(pool);
const { authRoutes, authMiddleware: authMiddlewareInstance } = authModule;

// Register the actual auth middleware to replace the stub
// Wrap to ensure proper signature compatibility
setAuthMiddleware((req, res, next) => {
  authMiddlewareInstance.authenticate(req as any, res, next);
});

// Setup Sales Module
const salesModule = bootstrapSalesModule(pool, eventBus, transactionManager);
const { router: salesRouter } = salesModule;

// ==================== Register Routes ====================

app.get('/health', async (_req, res) => {
  const now = await ping();
  res.json({ status: 'ok', time: now });
});

app.use('/v1/tenants', tenantRouter);
app.use('/v1/auth', authRoutes);
app.use('/v1/sales', salesRouter);

// ==================== Error Handling ====================

// 404 handler - catches all unmatched routes
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Global error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log.error({ err }, 'Unhandled error');
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// ==================== Graceful Shutdown ====================

process.on('SIGTERM', async () => {
  log.info('SIGTERM received, shutting down gracefully...');
  outboxDispatcher.stop();
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  log.info('SIGINT received, shutting down gracefully...');
  outboxDispatcher.stop();
  await pool.end();
  process.exit(0);
});

// ==================== Start Server ====================

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  log.info(`Server on http://localhost:${PORT}`);
  log.info(`API Documentation available at http://localhost:${PORT}/api-docs`);
  log.info('Registered routes:');
  log.info('  - GET  /health');
  log.info('  - *    /v1/tenants');
  log.info('  - *    /v1/auth');
  log.info('  - *    /v1/sales (NEW)');
});