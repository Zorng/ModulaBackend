import type { Pool } from "pg";
import { createV0AuthRouter } from "./api/router.js";
import { V0AuthService } from "./app/service.js";
import { V0AuthRepository } from "./infra/repository.js";

export function bootstrapV0AuthModule(pool: Pool) {
  const repo = new V0AuthRepository(pool);
  const service = new V0AuthService(repo);
  const router = createV0AuthRouter(service);
  return { router, service, repo };
}
