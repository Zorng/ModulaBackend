import type { Request, Response, NextFunction } from "express";
import type { ZodTypeAny, ZodObject } from "zod";
import { ZodError } from "zod";

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
        req.query = await schema.query.parseAsync(req.query) as any;
      }

      if (schema.params) {
        req.params = await schema.params.parseAsync(req.params) as any;
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

      console.error("[Validation Unexpected Error]", error);
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Validation failed unexpectedly",
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

