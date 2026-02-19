import type { Pool } from "pg";
import { createV0OperationalNotificationRouter } from "./api/router.js";
import { V0OperationalNotificationService } from "./app/service.js";
import { registerOperationalNotificationSubscribers } from "./app/subscribers.js";
import { V0OperationalNotificationRepository } from "./infra/repository.js";

export function bootstrapV0OperationalNotificationModule(pool: Pool) {
  const repo = new V0OperationalNotificationRepository(pool);
  const service = new V0OperationalNotificationService(repo);
  registerOperationalNotificationSubscribers(service);
  const router = createV0OperationalNotificationRouter(service);
  return { repo, service, router };
}

export { V0OperationalNotificationService } from "./app/service.js";
export { V0OperationalNotificationRepository } from "./infra/repository.js";
export { V0_OPERATIONAL_NOTIFICATION_ACTION_KEYS } from "./app/command-contract.js";
