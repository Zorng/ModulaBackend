import { SalesController } from './controllers/sales.controller.js';
import { createSalesRoutes } from './routes/sales.routes.js';
import type { AuthMiddlewarePort } from "../../../platform/security/auth.js";
import type { Pool } from "pg";

/**
 * Sales Module Router
 * 
 * Main router export for the sales module that wires up the controller
 * with all the route definitions and middleware.
 */

export function createSalesRouter(
  controller: SalesController,
  authMiddleware: AuthMiddlewarePort,
  pool: Pool
) {
  return createSalesRoutes(controller, authMiddleware, pool);
}

export type SalesRouterFactory = (
  controller: SalesController,
  authMiddleware: AuthMiddlewarePort,
  pool: Pool
) => ReturnType<typeof createSalesRoutes>;
