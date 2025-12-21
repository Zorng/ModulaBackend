import express, { Express } from "express";
import { Pool } from "pg";
import { bootstrapInventoryModule } from "../../index.js";
import { setupAuthModule } from "../../../auth/index.js";
import type { InvitationPort } from "../../../../shared/ports/staff-management.js";
import {
  errorHandler,
  notFoundHandler,
} from "../../../../platform/http/middleware/error-handler.js";

/**
 * Mock image storage adapter for testing
 */
const mockImageStorage = {
  uploadImage: async (file: Buffer, filename: string, tenantId: string) => {
    // Mock implementation - return a fake URL
    return `https://mock-storage.com/${tenantId}/${filename}`;
  },
  deleteImage: async (imageUrl: string, tenantId: string) => {
    // Mock implementation - do nothing
  },
  isValidImageUrl: (url: string) => {
    // Mock validation - check basic URL format
    return /^https?:\/\/.+\.(jpg|jpeg|png|webp)$/i.test(url);
  },
};

/**
 * Creates a minimal Express app for API testing
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
  const authModule = setupAuthModule(pool, {
    invitationPort,
    tenantProvisioningPort: {
      provisionTenant: async () => {
        throw new Error("not implemented");
      },
    },
  });
  const { authMiddleware } = authModule;

  // Setup mock image storage for tests
  app.locals.imageStorage = mockImageStorage;

  // Setup inventory module
  const inventoryModule = bootstrapInventoryModule(
    pool,
    authMiddleware,
    mockImageStorage
  );
  const { router: inventoryRouter } = inventoryModule;

  // Mount inventory routes
  app.use("/v1/inventory", inventoryRouter);

  // Error handlers
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
