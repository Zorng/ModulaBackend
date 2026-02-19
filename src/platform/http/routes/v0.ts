import { Router } from "express";
import { ping, pool } from "#db";
import { bootstrapV0AuthModule } from "#modules/v0/auth/index.js";
import { bootstrapV0AttendanceModule } from "#modules/v0/hr/attendance/index.js";
import { bootstrapV0OrgAccountModule } from "#modules/v0/orgAccount/index.js";
import { bootstrapV0SubscriptionModule } from "#modules/v0/subscription/index.js";
import { bootstrapV0AuditModule } from "#modules/v0/audit/index.js";
import { bootstrapV0StaffManagementModule } from "#modules/v0/hr/staffManagement/index.js";
import { bootstrapV0PolicyModule } from "#modules/v0/businessSystem/policy/index.js";
import { bootstrapV0MediaModule } from "#modules/v0/platformSystem/media/index.js";
import { bootstrapV0MenuModule } from "#modules/v0/posOperation/menu/index.js";
import { bootstrapV0DiscountModule } from "#modules/v0/posOperation/discount/index.js";

export const v0Router = Router();
const v0AuthModule = bootstrapV0AuthModule(pool);
const v0AttendanceModule = bootstrapV0AttendanceModule(pool);
const v0OrgAccountModule = bootstrapV0OrgAccountModule(pool);
const v0SubscriptionModule = bootstrapV0SubscriptionModule(pool);
const v0AuditModule = bootstrapV0AuditModule(pool);
const v0StaffManagementModule = bootstrapV0StaffManagementModule(pool);
const v0PolicyModule = bootstrapV0PolicyModule(pool);
const v0MediaModule = bootstrapV0MediaModule(pool);
const v0MenuModule = bootstrapV0MenuModule(pool);
const v0DiscountModule = bootstrapV0DiscountModule(pool);

v0Router.use("/auth", v0AuthModule.router);
v0Router.use("/attendance", v0AttendanceModule.router);
v0Router.use("/org", v0OrgAccountModule.router);
v0Router.use("/subscription", v0SubscriptionModule.router);
v0Router.use("/audit", v0AuditModule.router);
v0Router.use("/hr", v0StaffManagementModule.router);
v0Router.use("/policy", v0PolicyModule.router);
v0Router.use("/media", v0MediaModule.router);
v0Router.use("/menu", v0MenuModule.router);
v0Router.use("/discount", v0DiscountModule.router);

v0Router.get("/health", async (_req, res) => {
  const now = await ping();
  res.json({
    status: "ok",
    time: now,
    apiVersion: "v0",
  });
});
