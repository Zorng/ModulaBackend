import { SalesController } from './controllers/sales.controller.js';
import { createSalesRoutes } from './routes/sales.routes.js';
import { AuthMiddleware } from '../../../modules/auth/api/middleware/auth.middleware.js';

/**
 * Sales Module Router
 * 
 * Main router export for the sales module that wires up the controller
 * with all the route definitions and middleware.
 */

export function createSalesRouter(controller: SalesController, authMiddleware: AuthMiddleware) {
  return createSalesRoutes(controller, authMiddleware);
}

export type SalesRouterFactory = (controller: SalesController, authMiddleware: AuthMiddleware) => ReturnType<typeof createSalesRoutes>;