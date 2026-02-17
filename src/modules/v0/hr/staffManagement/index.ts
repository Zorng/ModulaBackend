import type { Pool } from "pg";
import { createV0StaffManagementRouter } from "./api/router.js";

export function bootstrapV0StaffManagementModule(pool: Pool) {
  const router = createV0StaffManagementRouter(pool);
  return { router };
}
