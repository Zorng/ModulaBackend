import { z } from "zod";

const branchIdSchema = z.string().uuid().optional();

const dateSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Invalid date format",
  });

export const listXReportsQuerySchema = z
  .object({
    branchId: branchIdSchema,
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    status: z.enum(["all", "open", "closed"]).optional(),
  })
  .strict();

export const reportSessionParamsSchema = z
  .object({
    sessionId: z.string().uuid(),
  })
  .strict();

export const reportDetailQuerySchema = z
  .object({
    branchId: branchIdSchema,
  })
  .strict();

export type ListXReportsQuery = z.infer<typeof listXReportsQuerySchema>;
export type ReportDetailQuery = z.infer<typeof reportDetailQuerySchema>;

export const zReportSummaryQuerySchema = z
  .object({
    branchId: branchIdSchema,
    date: dateSchema,
  })
  .strict();

export type ZReportSummaryQuery = z.infer<typeof zReportSummaryQuerySchema>;
