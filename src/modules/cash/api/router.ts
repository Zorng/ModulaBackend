import { CashController } from "./controller/index.js";
import { createCashRoutes } from "./routes/index.js";
import { AuthMiddleware } from "../../auth/api/middleware/auth.middleware.js";

/**
 * Cash Module Router
 *
 * Main router export for the cash module that wires up the controller
 * with all the route definitions and middleware.
 */

export function createCashRouter(
  controller: CashController,
  authMiddleware: AuthMiddleware
) {
  return createCashRoutes(controller, authMiddleware);
}

export type CashRouterFactory = (
  controller: CashController,
  authMiddleware: AuthMiddleware
) => ReturnType<typeof createCashRoutes>;
