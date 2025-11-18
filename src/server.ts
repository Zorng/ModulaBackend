import express from "express";
import { ping } from "#db";
import { log } from "#logger";
import { tenantRouter } from "#modules/tenant/api/router.js";
import { menuRouter } from "#modules/menu/api/router.js";
import { errorHandler, notFoundHandler } from "./platform/http/middleware/error-handler.js";
// import { menuRouter } from "#modules/menu/api/router.js";

const app = express();
app.use(express.json());

app.get("/health", async (_req, res) => {
  const now = await ping();
  res.json({ status: "ok", time: now });
});

app.use(tenantRouter); // <-- mounts /v1/tenants
app.use(menuRouter);

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => log.info(`Server on http://localhost:${PORT}`));
