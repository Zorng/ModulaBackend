import { Router } from "express";
import { ping, pool } from "#db";
import { bootstrapV0AuthModule } from "#modules/v0/auth/index.js";

export const v0Router = Router();
const v0AuthModule = bootstrapV0AuthModule(pool);

v0Router.use("/auth", v0AuthModule.router);

v0Router.get("/health", async (_req, res) => {
  const now = await ping();
  res.json({
    status: "ok",
    time: now,
    apiVersion: "v0",
  });
});
