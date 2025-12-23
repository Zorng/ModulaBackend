import { Router } from "express";
import type { AuthMiddlewarePort } from "../../../platform/security/auth.js";
import { validateParams, validateQuery } from "../../../platform/http/middleware/validation.js";
import type { ReportingService } from "../app/queries.js";
import { ReportingController } from "./controller.js";
import {
  listXReportsQuerySchema,
  reportDetailQuerySchema,
  reportSessionParamsSchema,
  zReportSummaryQuerySchema,
} from "./schemas.js";

export function createReportingRouter(
  authMiddleware: AuthMiddlewarePort,
  reportingService: ReportingService
) {
  const router = Router();
  const controller = new ReportingController(reportingService);

  router.get(
    "/cash/x",
    authMiddleware.authenticate,
    validateQuery(listXReportsQuerySchema),
    async (req, res, next) => controller.listXReports(req as any, res, next)
  );

  router.get(
    "/cash/x/:sessionId",
    authMiddleware.authenticate,
    validateParams(reportSessionParamsSchema),
    validateQuery(reportDetailQuerySchema),
    async (req, res, next) => controller.getXReportDetail(req as any, res, next)
  );

  router.get(
    "/cash/z/:sessionId",
    authMiddleware.authenticate,
    validateParams(reportSessionParamsSchema),
    validateQuery(reportDetailQuerySchema),
    async (req, res, next) => controller.getZReportDetail(req as any, res, next)
  );

  router.get(
    "/cash/z",
    authMiddleware.authenticate,
    validateQuery(zReportSummaryQuerySchema),
    async (req, res, next) => controller.getZReportSummary(req as any, res, next)
  );

  return router;
}
