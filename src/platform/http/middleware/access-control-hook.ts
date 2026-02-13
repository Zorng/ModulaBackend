import type { Request, Response, NextFunction } from "express";

/**
 * Placeholder for the new centralized AccessControl gate in the /v0 stack.
 * Phase 0 keeps this as a no-op so we can wire the pipeline before AuthZ lands.
 */
export function accessControlHook(
  _req: Request,
  _res: Response,
  next: NextFunction
): void {
  next();
}
