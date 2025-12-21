import express, { Express } from "express";
import { Pool } from "pg";
import { setupAuthModule } from "../../../auth/index.js";
import { createPolicyRouter } from "../../api/router.js";
import type { InvitationPort } from "../../../../shared/ports/staff-management.js";
import {
  errorHandler,
  notFoundHandler,
} from "../../../../platform/http/middleware/error-handler.js";

/**
 * Creates a minimal Express app for Policy API testing
 */
export function createTestApp(pool: Pool): Express {
  const app = express();
  app.use(express.json());

  // Setup auth module
  const invitationPort: InvitationPort = {
    peekValidInvite: async () => {
      throw new Error("not implemented");
    },
    acceptInvite: async () => {
      throw new Error("not implemented");
    },
  };
  const { authMiddleware } = setupAuthModule(pool, {
    invitationPort,
    tenantProvisioningPort: {
      provisionTenant: async () => {
        throw new Error("not implemented");
      },
    },
  });

  // Mount policy routes
  app.use("/v1/policies", createPolicyRouter(authMiddleware));

  // Error handlers
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
