import express, { Express } from "express";
import { Pool } from "pg";
import { setupAuthModule } from "../../../auth/index.js";
import { policyRouter } from "../../api/router.js";
import {
  errorHandler,
  notFoundHandler,
} from "../../../../platform/http/middleware/error-handler.js";

/**
 * Creates a minimal Express app for Policy API testing
 */
export function createTestApp(pool: Pool): Express {
  const app = express();
  app.use(express.json());

  // Setup auth module
  const authModule = setupAuthModule(pool);

  // Mount policy routes
  app.use(policyRouter);

  // Error handlers
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

