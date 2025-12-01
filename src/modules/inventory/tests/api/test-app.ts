import express, { Express } from "express";
import { Pool } from "pg";
import { bootstrapInventoryModule } from "../../index.js";
import { setupAuthModule } from "../../../auth/index.js";
import {
  errorHandler,
  notFoundHandler,
} from "../../../../platform/http/middleware/error-handler.js";

/**
 * Creates a minimal Express app for API testing
 */
export function createTestApp(pool: Pool): Express {
  const app = express();
  app.use(express.json());

  // Setup auth module
  const authModule = setupAuthModule(pool);
  const { authMiddleware } = authModule;

  // Setup inventory module
  const inventoryModule = bootstrapInventoryModule(pool, authMiddleware);
  const { router: inventoryRouter } = inventoryModule;

  // Mount inventory routes
  app.use("/v1/inventory", inventoryRouter);

  // Error handlers
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
