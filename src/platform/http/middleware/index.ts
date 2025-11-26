export {
  authenticate,
//   optionalAuth,
  requireRole,
  type AuthenticatedUser,
} from "./auth.js";

export {
  validate,
  validateBody,
  validateQuery,
  validateParams,
} from "./validation.js";

export { errorHandler, notFoundHandler } from "./error-handler.js";
