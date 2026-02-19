import { createV0MediaRouter } from "./api/router.js";
import { V0MediaService } from "./app/service.js";

export function bootstrapV0MediaModule() {
  const service = new V0MediaService();
  const router = createV0MediaRouter(service);
  return { service, router };
}
