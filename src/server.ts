import express from 'express';
import cors from 'cors';
import { ping } from '#db';
import { log } from '#logger';
import { tenantRouter } from '#modules/tenant/api/router.js';
import { authRouter } from '#modules/auth/api/auth.router.js';
import { setupSwagger } from './platform/config/swagger.config.js';
// src/server.ts
import express from "express";
import { ping } from "#db";
import { log } from "#logger";
import { tenantRouter } from "#modules/tenant/api/router.js";
import { menuRouter } from "./modules/menu/api/router/index.js";
import {
  errorHandler,
  notFoundHandler,
} from "./platform/http/middleware/error-handler.js";
import { setupSwagger } from "./platform/http/swagger.js";
import { createImageStorageAdapter } from "#modules/menu/infra/repositories/imageAdapter.js";

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

app.get('/health', async (_req, res) => {
  const now = await ping();
  res.json({ status: 'ok', time: now });
});

app.use('/v1/tenants', tenantRouter); // <-- mounts /v1/tenants
app.use('/v1/auth', authRouter);

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  log.info(`Server on http://localhost:${PORT}`);
  log.info(`API Documentation available at http://localhost:${PORT}/api-docs`);
});
app.locals.imageStorage = createImageStorageAdapter();

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
app.use(tenantRouter);
app.use(menuRouter);

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  log.info(`🚀 Server running on http://localhost:${PORT}`);
  log.info(`📚 API docs available at http://localhost:${PORT}/api-docs`);
  log.info(`📄 OpenAPI spec at http://localhost:${PORT}/openapi.json`);
});
