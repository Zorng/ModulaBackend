import type { Pool } from "pg";
import { createV0SubscriptionRouter } from "./api/router.js";
import { V0SubscriptionService } from "./app/service.js";
import { V0SubscriptionRepository } from "./infra/repository.js";

export function bootstrapV0SubscriptionModule(pool: Pool) {
  const repo = new V0SubscriptionRepository(pool);
  const service = new V0SubscriptionService(repo);
  const router = createV0SubscriptionRouter(service);
  return { repo, service, router };
}
