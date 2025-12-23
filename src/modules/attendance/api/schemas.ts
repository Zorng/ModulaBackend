import { z } from "zod";

const dateSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Invalid date format",
  });

const locationSchema = z
  .object({
    lat: z.number(),
    lng: z.number(),
  })
  .strict();

export const checkInBodySchema = z
  .object({
    occurredAt: dateSchema.optional(),
    location: locationSchema.optional(),
    shiftStatus: z.enum(["IN_SHIFT", "EARLY", "OUT_OF_SHIFT"]).optional(),
    earlyMinutes: z.number().int().min(0).optional(),
    note: z.string().max(500).optional(),
  })
  .strict();

export const checkOutBodySchema = z
  .object({
    occurredAt: dateSchema.optional(),
    location: locationSchema.optional(),
  })
  .strict();

export const listAttendanceQuerySchema = z
  .object({
    branchId: z.string().uuid().optional(),
    employeeId: z.string().uuid().optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export const attendanceRequestParamsSchema = z
  .object({
    requestId: z.string().uuid(),
  })
  .strict();

export const attendanceShiftQuerySchema = z
  .object({
    branchId: z.string().uuid().optional(),
  })
  .strict();

export type CheckInBody = z.infer<typeof checkInBodySchema>;
export type CheckOutBody = z.infer<typeof checkOutBodySchema>;
export type ListAttendanceQuery = z.infer<typeof listAttendanceQuerySchema>;
export type AttendanceRequestParams = z.infer<typeof attendanceRequestParamsSchema>;
export type AttendanceShiftQuery = z.infer<typeof attendanceShiftQuerySchema>;
