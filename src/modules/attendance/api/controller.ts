import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../../../platform/security/auth.js";
import type {
  CheckInUseCase,
  CheckOutUseCase,
  ListAttendanceUseCase,
  ApproveOutOfShiftRequestUseCase,
  RejectOutOfShiftRequestUseCase,
  ListMyShiftScheduleUseCase,
} from "../app/use-cases.js";
import type {
  CheckInBody,
  CheckOutBody,
  ListAttendanceQuery,
  AttendanceRequestParams,
  AttendanceShiftQuery,
} from "./schemas.js";

const allowedRoles = new Set(["ADMIN", "MANAGER", "CASHIER"]);

export class AttendanceController {
  constructor(
    private checkInUseCase: CheckInUseCase,
    private checkOutUseCase: CheckOutUseCase,
    private listAttendanceUseCase: ListAttendanceUseCase,
    private approveRequestUseCase: ApproveOutOfShiftRequestUseCase,
    private rejectRequestUseCase: RejectOutOfShiftRequestUseCase,
    private listMyShiftScheduleUseCase: ListMyShiftScheduleUseCase
  ) {}

  async checkIn(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId, employeeId, branchId, role } = req.user || {};
      if (!tenantId || !employeeId || !branchId || !role) {
        return res.status(401).json({ error: "Authentication required" });
      }
      if (!allowedRoles.has(role)) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }

      const body = req.body as CheckInBody;
      const result = await this.checkInUseCase.execute({
        tenantId,
        branchId,
        employeeId,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
        location: body.location,
        shiftStatus: body.shiftStatus,
        earlyMinutes: body.earlyMinutes,
        note: body.note ?? null,
      });

      if (!result.ok) {
        return res.status(400).json({ error: result.error });
      }

      return res.json({ success: true, data: result.value });
    } catch (error) {
      next(error);
    }
  }

  async checkOut(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId, employeeId, branchId, role } = req.user || {};
      if (!tenantId || !employeeId || !branchId || !role) {
        return res.status(401).json({ error: "Authentication required" });
      }
      if (!allowedRoles.has(role)) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }

      const body = req.body as CheckOutBody;
      const result = await this.checkOutUseCase.execute({
        tenantId,
        branchId,
        employeeId,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
        location: body.location,
      });

      if (!result.ok) {
        return res.status(400).json({ error: result.error });
      }

      return res.json({ success: true, data: result.value });
    } catch (error) {
      next(error);
    }
  }

  async listSelf(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId, employeeId, branchId: userBranchId, role } =
        req.user || {};
      if (!tenantId || !employeeId || !role) {
        return res.status(401).json({ error: "Authentication required" });
      }
      if (!allowedRoles.has(role)) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }

      const query = ((req as any).validatedQuery ??
        req.query) as ListAttendanceQuery;
      const branchId = query.branchId ?? userBranchId;
      if (query.branchId && query.branchId !== userBranchId) {
        return res.status(403).json({ error: "Branch access denied" });
      }
      if (role === "MANAGER" && query.branchId && query.branchId !== userBranchId) {
        return res.status(403).json({ error: "Branch access denied" });
      }

      const result = await this.listAttendanceUseCase.execute({
        tenantId,
        role: "CASHIER",
        requesterEmployeeId: employeeId,
        branchId,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        limit: query.limit,
        offset: query.offset,
      });

      if (!result.ok) {
        return res.status(400).json({ error: result.error });
      }

      return res.json({ success: true, data: result.value });
    } catch (error) {
      next(error);
    }
  }

  async listBranch(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId, employeeId, branchId: userBranchId, role } =
        req.user || {};
      if (!tenantId || !employeeId || !role) {
        return res.status(401).json({ error: "Authentication required" });
      }
      if (role !== "MANAGER" && role !== "ADMIN") {
        return res.status(403).json({ error: "Insufficient permissions" });
      }

      const query = ((req as any).validatedQuery ??
        req.query) as ListAttendanceQuery;
      const branchId = query.branchId ?? userBranchId;

      const result = await this.listAttendanceUseCase.execute({
        tenantId,
        role: role as "MANAGER" | "ADMIN",
        requesterEmployeeId: employeeId,
        branchId,
        employeeId: query.employeeId,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        limit: query.limit,
        offset: query.offset,
      });

      if (!result.ok) {
        return res.status(400).json({ error: result.error });
      }

      return res.json({ success: true, data: result.value });
    } catch (error) {
      next(error);
    }
  }

  async listAll(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId, employeeId, role } = req.user || {};
      if (!tenantId || !employeeId || !role) {
        return res.status(401).json({ error: "Authentication required" });
      }
      if (role !== "ADMIN") {
        return res.status(403).json({ error: "Insufficient permissions" });
      }

      const query = ((req as any).validatedQuery ??
        req.query) as ListAttendanceQuery;

      const result = await this.listAttendanceUseCase.execute({
        tenantId,
        role: "ADMIN",
        requesterEmployeeId: employeeId,
        branchId: query.branchId,
        employeeId: query.employeeId,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        limit: query.limit,
        offset: query.offset,
      });

      if (!result.ok) {
        return res.status(400).json({ error: result.error });
      }

      return res.json({ success: true, data: result.value });
    } catch (error) {
      next(error);
    }
  }

  async approveRequest(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId, employeeId, branchId, role } = req.user || {};
      if (!tenantId || !employeeId || !branchId || !role) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const params = req.params as AttendanceRequestParams;
      const result = await this.approveRequestUseCase.execute({
        tenantId,
        branchId,
        requestId: params.requestId,
        actorId: employeeId,
        actorRole: role as "ADMIN" | "MANAGER" | "CASHIER",
      });

      if (!result.ok) {
        return res.status(400).json({ error: result.error });
      }

      return res.json({ success: true, data: result.value });
    } catch (error) {
      next(error);
    }
  }

  async rejectRequest(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId, employeeId, branchId, role } = req.user || {};
      if (!tenantId || !employeeId || !branchId || !role) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const params = req.params as AttendanceRequestParams;
      const result = await this.rejectRequestUseCase.execute({
        tenantId,
        branchId,
        requestId: params.requestId,
        actorId: employeeId,
        actorRole: role as "ADMIN" | "MANAGER" | "CASHIER",
      });

      if (!result.ok) {
        return res.status(400).json({ error: result.error });
      }

      return res.json({ success: true, data: result.value });
    } catch (error) {
      next(error);
    }
  }

  async listMyShifts(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { tenantId, employeeId, branchId: userBranchId, role } =
        req.user || {};
      if (!tenantId || !employeeId || !userBranchId || !role) {
        return res.status(401).json({ error: "Authentication required" });
      }
      if (!allowedRoles.has(role)) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }

      const query = ((req as any).validatedQuery ??
        req.query) as AttendanceShiftQuery;
      if (query.branchId && query.branchId !== userBranchId) {
        return res.status(403).json({ error: "Branch access denied" });
      }

      const result = await this.listMyShiftScheduleUseCase.execute({
        tenantId,
        employeeId,
        branchId: userBranchId,
      });

      if (!result.ok) {
        return res.status(400).json({ error: result.error });
      }

      return res.json({ success: true, data: result.value });
    } catch (error) {
      next(error);
    }
  }
}
