import type { Pool } from "pg";
import { AccountSettingsRepository } from "./infra/repository.js";
import {
  createAccountSettingsRouter,
  type AuthMiddlewarePort,
} from "./api/router.js";

export function bootstrapAccountSettingsModule(
  pool: Pool,
  authMiddleware: AuthMiddlewarePort
) {
  const repo = new AccountSettingsRepository(pool);
  const router = createAccountSettingsRouter(repo, authMiddleware);
  return { router };
}

