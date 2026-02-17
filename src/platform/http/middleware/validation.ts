import type { Request, Response, NextFunction } from "express";
import type { ZodTypeAny, ZodObject } from "zod";
import { ZodError } from "zod";
import { log } from "#logger";

export const validate = (schema: {
  body?: ZodObject<any>;
  query?: ZodObject<any>;
  params?: ZodObject<any>;
}) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schema.body) {
        req.body = await schema.body.parseAsync(req.body);
      }

      if (schema.query) {
        (req as any).validatedQuery = await schema.query.parseAsync(req.query);
      }

      if (schema.params) {
        log.debug("http.validation.params.received", {
          event: "http.validation.params.received",
          requestId: req.v0Context?.requestId,
          params: req.params,
        });
        req.params = (await schema.params.parseAsync(req.params)) as any;
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: "Validation Error",
          message: "Request validation failed",
          details: error.issues.map((err) => ({
            field: err.path.join("."),
            message: err.message,
          })),
        });
      }

      log.error("http.validation.failed_unexpected", {
        event: "http.validation.failed_unexpected",
        requestId: req.v0Context?.requestId,
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Validation failed unexpectedly",
        requestId: req.v0Context?.requestId,
      });
    }
  };
};

export const validateBody = (schema: ZodObject<any>) =>
  validate({ body: schema });

export const validateQuery = (schema: ZodObject<any>) =>
  validate({ query: schema });

export const validateParams = (schema: ZodObject<any>) =>
  validate({ params: schema });
