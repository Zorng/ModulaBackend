import { Router } from "express";
import type { AuthMiddlewarePort } from "../../../platform/security/auth.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../../platform/http/middleware/validation.js";
import { AttendanceController } from "./controller.js";
import {
  checkInBodySchema,
  checkOutBodySchema,
  listAttendanceQuerySchema,
  attendanceRequestParamsSchema,
  attendanceShiftQuerySchema,
} from "./schemas.js";
import type {
  CheckInUseCase,
  CheckOutUseCase,
  ListAttendanceUseCase,
  ApproveOutOfShiftRequestUseCase,
  RejectOutOfShiftRequestUseCase,
  ListMyShiftScheduleUseCase,
} from "../app/use-cases.js";

export function createAttendanceRouter(
  authMiddleware: AuthMiddlewarePort,
  deps: {
    checkInUseCase: CheckInUseCase;
    checkOutUseCase: CheckOutUseCase;
    listAttendanceUseCase: ListAttendanceUseCase;
    approveRequestUseCase: ApproveOutOfShiftRequestUseCase;
    rejectRequestUseCase: RejectOutOfShiftRequestUseCase;
    listMyShiftScheduleUseCase: ListMyShiftScheduleUseCase;
  }
) {
  const attendanceRouter = Router();
  const controller = new AttendanceController(
    deps.checkInUseCase,
    deps.checkOutUseCase,
    deps.listAttendanceUseCase,
    deps.approveRequestUseCase,
    deps.rejectRequestUseCase,
    deps.listMyShiftScheduleUseCase
  );

  attendanceRouter.post(
    "/check-in",
    authMiddleware.authenticate,
    validateBody(checkInBodySchema),
    async (req, res, next) => controller.checkIn(req as any, res, next)
  );

  attendanceRouter.post(
    "/check-out",
    authMiddleware.authenticate,
    validateBody(checkOutBodySchema),
    async (req, res, next) => controller.checkOut(req as any, res, next)
  );

  attendanceRouter.get(
    "/me",
    authMiddleware.authenticate,
    validateQuery(listAttendanceQuerySchema),
    async (req, res, next) => controller.listSelf(req as any, res, next)
  );

  attendanceRouter.get(
    "/me/shifts",
    authMiddleware.authenticate,
    validateQuery(attendanceShiftQuerySchema),
    async (req, res, next) => controller.listMyShifts(req as any, res, next)
  );

  attendanceRouter.get(
    "/branch",
    authMiddleware.authenticate,
    validateQuery(listAttendanceQuerySchema),
    async (req, res, next) => controller.listBranch(req as any, res, next)
  );

  attendanceRouter.get(
    "/all",
    authMiddleware.authenticate,
    validateQuery(listAttendanceQuerySchema),
    async (req, res, next) => controller.listAll(req as any, res, next)
  );

  attendanceRouter.post(
    "/requests/:requestId/approve",
    authMiddleware.authenticate,
    validateParams(attendanceRequestParamsSchema),
    async (req, res, next) => controller.approveRequest(req as any, res, next)
  );

  attendanceRouter.post(
    "/requests/:requestId/reject",
    authMiddleware.authenticate,
    validateParams(attendanceRequestParamsSchema),
    async (req, res, next) => controller.rejectRequest(req as any, res, next)
  );

  return attendanceRouter;
}
