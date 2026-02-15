import type { Pool } from "pg";
import { createV0OrgAccountRouter } from "./api/router.js";
import { V0OrgAccountService } from "./app/service.js";
import { V0OrgAccountRepository } from "./infra/repository.js";

export function bootstrapV0OrgAccountModule(pool: Pool) {
  const repo = new V0OrgAccountRepository(pool);
  const service = new V0OrgAccountService(repo);
  const router = createV0OrgAccountRouter(service);
  return { repo, service, router };
}
