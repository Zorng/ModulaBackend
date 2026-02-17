import type { Pool } from "pg";
import { createV0OrgAccountRouter } from "./api/router.js";

export function bootstrapV0OrgAccountModule(pool: Pool) {
  const router = createV0OrgAccountRouter(pool);
  return { router };
}
