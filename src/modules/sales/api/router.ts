import { SalesController } from './controllers/sales.controller.js';
import { createSalesRoutes } from './routes/sales.routes.js';

/**
 * Sales Module Router
 * 
 * Main router export for the sales module that wires up the controller
 * with all the route definitions and middleware.
 */

export function createSalesRouter(controller: SalesController) {
  return createSalesRoutes(controller);
}

export type SalesRouterFactory = (controller: SalesController) => ReturnType<typeof createSalesRoutes>;