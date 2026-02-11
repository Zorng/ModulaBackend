import {
  SessionController,
  MovementController,
  ReportController,
  RegisterController,
} from "./controller/index.js";
import { createCashRoutes } from "./routes/index.js";
import type { AuthMiddlewarePort } from "../../../platform/security/auth.js";

/**
 * Cash Module Router
 *
 * Main router export for the cash module that wires up the controllers
 * with all the route definitions and middleware.
 */

export function createCashRouter(
  sessionController: SessionController,
  movementController: MovementController,
  reportController: ReportController,
  registerController: RegisterController,
  authMiddleware: AuthMiddlewarePort
) {
  return createCashRoutes(
    sessionController,
    movementController,
    reportController,
    registerController,
    authMiddleware
  );
}

export type CashRouterFactory = (
  sessionController: SessionController,
  movementController: MovementController,
  reportController: ReportController,
  registerController: RegisterController,
  authMiddleware: AuthMiddlewarePort
) => ReturnType<typeof createCashRoutes>;
