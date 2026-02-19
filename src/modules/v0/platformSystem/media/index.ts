import type { Pool } from "pg";
import { V0MediaUploadRepository } from "../../../../platform/media-uploads/repository.js";
import { createV0MediaRouter } from "./api/router.js";
import { V0MediaService } from "./app/service.js";

export function bootstrapV0MediaModule(pool: Pool) {
  const uploadsRepo = new V0MediaUploadRepository(pool);
  const service = new V0MediaService(uploadsRepo);
  const router = createV0MediaRouter(service);
  return { service, uploadsRepo, router };
}
