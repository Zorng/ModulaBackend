import type { Pool } from "pg";
import { Router } from "express";
import { V0IdempotencyRepository } from "../../../platform/idempotency/repository.js";
import { V0IdempotencyService } from "../../../platform/idempotency/service.js";
import { createV0BranchRouter } from "./branch/api/router.js";
import { StubFirstBranchPaymentVerifier } from "./branch/app/payment-verifier.js";
import { V0BranchService } from "./branch/app/service.js";
import { V0BranchRepository } from "./branch/infra/repository.js";
import { createV0MembershipRouter } from "./membership/api/router.js";
import { createV0TenantRouter } from "./tenant/api/router.js";
import { V0TenantService } from "./tenant/app/service.js";
import { V0TenantRepository } from "./tenant/infra/repository.js";

export function bootstrapV0OrgAccountModule(pool: Pool) {
  const router = createV0OrgAccountRouter(pool);
  return { router };
}

export function createV0OrgAccountRouter(db: Pool): Router {
  const router = Router();

  const idempotencyService = new V0IdempotencyService(new V0IdempotencyRepository(db));
  const tenantService = new V0TenantService(new V0TenantRepository(db));
  const branchService = new V0BranchService(
    new V0BranchRepository(db),
    new StubFirstBranchPaymentVerifier()
  );

  router.use(createV0TenantRouter(tenantService, db));
  router.use(
    createV0BranchRouter({
      service: branchService,
      db,
      idempotencyService,
    })
  );
  router.use(createV0MembershipRouter(db));

  return router;
}
